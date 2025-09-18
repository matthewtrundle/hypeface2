import { HyperliquidClient } from './hyperliquid-client';
import { marginCalculator, AccountMetrics } from './margin-calculator';
import { logger } from '../lib/logger';

/**
 * Leverage Manager for Hyperliquid Trading
 *
 * Manages leverage settings dynamically based on:
 * - Account health and margin usage
 * - Market volatility
 * - Position size and risk
 * - Pyramid level
 */

export interface LeverageConfig {
  baseLeverage: number;           // Default leverage (e.g., 5x)
  maxLeverage: number;            // Maximum allowed leverage (e.g., 10x)
  minLeverage: number;            // Minimum leverage (e.g., 1x)
  autoAdjust: boolean;            // Enable automatic leverage adjustment
  volatilityAdjustment: boolean;  // Adjust based on market volatility
  marginThreshold: number;        // Margin usage threshold for reduction (e.g., 0.7)
}

export interface LeverageDecision {
  recommendedLeverage: number;
  currentLeverage: number;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  shouldReduce: boolean;
  maxSafePosition: number;
}

export class LeverageManager {
  private config: LeverageConfig;
  private lastAdjustment: Date | null = null;
  private adjustmentCooldown = 60000; // 1 minute cooldown between adjustments

  constructor(config?: Partial<LeverageConfig>) {
    this.config = {
      baseLeverage: 5,
      maxLeverage: 10,
      minLeverage: 1,
      autoAdjust: true,
      volatilityAdjustment: true,
      marginThreshold: 0.7,
      ...config
    };
  }

  /**
   * Determine optimal leverage for a new position
   */
  async calculateOptimalLeverage(
    client: HyperliquidClient,
    symbol: string,
    pyramidLevel: number = 0
  ): Promise<LeverageDecision> {
    try {
      // Get current account metrics
      const accountValue = await client.getAccountValue();
      const positions = await client.getPositions();

      // Calculate current margin usage
      const totalMarginUsed = this.calculateTotalMarginUsed(positions, accountValue);
      const marginRatio = totalMarginUsed / accountValue;

      // Start with base leverage
      let leverage = this.config.baseLeverage;
      let reason = 'Using base leverage';
      let riskLevel: LeverageDecision['riskLevel'] = 'medium';

      // Adjust for pyramid level (reduce leverage at higher levels)
      if (pyramidLevel > 0) {
        const pyramidReduction = 1 - (pyramidLevel * 0.15); // 15% reduction per level
        leverage *= Math.max(0.5, pyramidReduction);
        reason = `Reduced for pyramid level ${pyramidLevel + 1}`;
      }

      // Check margin usage and reduce if necessary
      if (marginRatio > this.config.marginThreshold) {
        const reductionFactor = 1 - ((marginRatio - this.config.marginThreshold) * 2);
        leverage *= Math.max(0.3, reductionFactor);
        reason = `High margin usage (${(marginRatio * 100).toFixed(1)}%)`;
        riskLevel = marginRatio > 0.85 ? 'critical' : 'high';
      } else if (marginRatio < 0.3) {
        riskLevel = 'low';
      }

      // Get market volatility if available
      if (this.config.volatilityAdjustment) {
        const volatility = await this.estimateVolatility(client, symbol);
        if (volatility > 0.03) { // 3% volatility
          leverage *= 0.7;
          reason += ', high volatility detected';
          riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
        }
      }

      // Apply bounds
      leverage = Math.max(this.config.minLeverage, Math.min(this.config.maxLeverage, leverage));

      // Calculate max safe position with this leverage
      const availableMargin = accountValue * (1 - marginRatio) * 0.95; // 95% safety buffer
      const currentPrice = await client.getMarketPrice(symbol);
      const maxSafePosition = (availableMargin * leverage) / currentPrice;

      // Get current leverage for comparison
      const currentLeverage = this.getCurrentAccountLeverage(positions, accountValue);

      return {
        recommendedLeverage: Math.round(leverage * 10) / 10, // Round to 1 decimal
        currentLeverage,
        reason,
        riskLevel,
        shouldReduce: leverage < currentLeverage,
        maxSafePosition: Math.floor(maxSafePosition * 100) / 100
      };

    } catch (error) {
      logger.error('Error calculating optimal leverage', error);
      return {
        recommendedLeverage: this.config.minLeverage,
        currentLeverage: 0,
        reason: 'Error occurred, using minimum leverage',
        riskLevel: 'high',
        shouldReduce: true,
        maxSafePosition: 0
      };
    }
  }

  /**
   * Monitor and adjust leverage for existing positions
   */
  async monitorAndAdjustLeverage(
    client: HyperliquidClient,
    symbol: string
  ): Promise<boolean> {
    if (!this.config.autoAdjust) {
      return false;
    }

    // Check cooldown
    if (this.lastAdjustment) {
      const timeSinceLastAdjustment = Date.now() - this.lastAdjustment.getTime();
      if (timeSinceLastAdjustment < this.adjustmentCooldown) {
        return false;
      }
    }

    try {
      const decision = await this.calculateOptimalLeverage(client, symbol);

      if (decision.shouldReduce && decision.riskLevel === 'critical') {
        logger.warn(`⚠️ Critical risk level detected for ${symbol}`, {
          currentLeverage: decision.currentLeverage,
          recommendedLeverage: decision.recommendedLeverage,
          reason: decision.reason
        });

        // Apply new leverage
        const result = await client.setLeverage(
          symbol,
          'cross',
          decision.recommendedLeverage
        );

        if (result) {
          this.lastAdjustment = new Date();
          logger.info(`✅ Leverage adjusted for ${symbol}`, {
            newLeverage: decision.recommendedLeverage,
            reason: decision.reason
          });
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.error('Error monitoring leverage', error);
      return false;
    }
  }

  /**
   * Validate leverage before placing an order
   */
  validateLeverageForOrder(
    currentMarginRatio: number,
    orderSize: number,
    orderPrice: number,
    accountValue: number,
    desiredLeverage: number
  ): {
    isValid: boolean;
    adjustedLeverage: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let adjustedLeverage = desiredLeverage;

    // Calculate new margin ratio after order
    const orderValue = orderSize * orderPrice;
    const orderMargin = orderValue / desiredLeverage;
    const newMarginRatio = currentMarginRatio + (orderMargin / accountValue);

    // Check if new margin ratio is acceptable
    if (newMarginRatio > 0.9) {
      warnings.push('Order would exceed 90% margin usage');
      return {
        isValid: false,
        adjustedLeverage: 0,
        warnings
      };
    }

    if (newMarginRatio > this.config.marginThreshold) {
      // Reduce leverage to stay within threshold
      const maxAllowedMargin = (this.config.marginThreshold - currentMarginRatio) * accountValue;
      adjustedLeverage = Math.min(desiredLeverage, orderValue / maxAllowedMargin);
      warnings.push(`Leverage reduced to ${adjustedLeverage.toFixed(1)}x to maintain safe margin`);
    }

    // Check absolute leverage limits
    if (adjustedLeverage > this.config.maxLeverage) {
      adjustedLeverage = this.config.maxLeverage;
      warnings.push(`Leverage capped at maximum ${this.config.maxLeverage}x`);
    }

    return {
      isValid: adjustedLeverage >= this.config.minLeverage,
      adjustedLeverage: Math.round(adjustedLeverage * 10) / 10,
      warnings
    };
  }

  /**
   * Calculate leverage for pyramid positions
   */
  calculatePyramidLeverage(
    pyramidLevel: number,
    accountHealth: number,
    baseConfig: { marginPercentages: number[], fixedLeverage: number }
  ): number {
    // Start with fixed leverage from config
    let leverage = baseConfig.fixedLeverage;

    // Reduce leverage at higher pyramid levels
    const levelMultiplier = Math.max(0.6, 1 - (pyramidLevel * 0.1));
    leverage *= levelMultiplier;

    // Further reduce if account health is poor
    if (accountHealth < 0.5) {
      leverage *= 0.8;
    } else if (accountHealth < 0.3) {
      leverage *= 0.6;
    }

    return Math.max(this.config.minLeverage, Math.round(leverage * 10) / 10);
  }

  /**
   * Get leverage recommendations for different scenarios
   */
  getLeverageRecommendations(marginRatio: number): {
    newPosition: number;
    scaleIn: number;
    emergency: number;
    maximum: number;
  } {
    if (marginRatio > 0.8) {
      return {
        newPosition: 0,      // No new positions
        scaleIn: 0,          // No scaling in
        emergency: 1,        // Minimum leverage only
        maximum: 1
      };
    } else if (marginRatio > 0.6) {
      return {
        newPosition: 2,
        scaleIn: 1.5,
        emergency: 1,
        maximum: 3
      };
    } else if (marginRatio > 0.4) {
      return {
        newPosition: 3,
        scaleIn: 2.5,
        emergency: 1,
        maximum: 5
      };
    } else {
      return {
        newPosition: this.config.baseLeverage,
        scaleIn: this.config.baseLeverage * 0.8,
        emergency: 1,
        maximum: this.config.maxLeverage
      };
    }
  }

  /**
   * Calculate total margin used across all positions
   */
  private calculateTotalMarginUsed(positions: any[], accountValue: number): number {
    let totalMargin = 0;

    for (const position of positions) {
      const size = Math.abs(parseFloat(position.szi || '0'));
      const entryPrice = parseFloat(position.entryPx || '0');
      const leverage = parseFloat(position.leverage || '1');

      if (size > 0 && entryPrice > 0) {
        const positionValue = size * entryPrice;
        const margin = positionValue / leverage;
        totalMargin += margin;
      }
    }

    return totalMargin;
  }

  /**
   * Get current account-wide leverage
   */
  private getCurrentAccountLeverage(positions: any[], accountValue: number): number {
    let totalNotional = 0;

    for (const position of positions) {
      const size = Math.abs(parseFloat(position.szi || '0'));
      const entryPrice = parseFloat(position.entryPx || '0');

      if (size > 0 && entryPrice > 0) {
        totalNotional += size * entryPrice;
      }
    }

    return accountValue > 0 ? totalNotional / accountValue : 0;
  }

  /**
   * Estimate market volatility (simplified)
   */
  private async estimateVolatility(client: HyperliquidClient, symbol: string): Promise<number> {
    try {
      // This is a simplified volatility estimate
      // In production, you'd want to use historical price data
      const currentPrice = await client.getMarketPrice(symbol);

      // For now, return a conservative estimate
      // You could enhance this with actual price history
      return 0.02; // 2% default volatility

    } catch (error) {
      logger.error('Error estimating volatility', error);
      return 0.05; // Conservative high volatility on error
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LeverageConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Leverage manager config updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): LeverageConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const leverageManager = new LeverageManager();