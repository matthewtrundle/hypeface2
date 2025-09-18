import { logger } from '../lib/logger';

/**
 * Margin Calculator for Hyperliquid Trading
 *
 * Handles all margin requirements, leverage calculations, and position sizing
 * for safe and efficient trading on Hyperliquid DEX
 */

export interface MarginRequirements {
  requiredMargin: number;      // Margin required for the position
  availableMargin: number;     // Available margin in account
  maxPositionSize: number;     // Maximum position size allowed
  actualPositionSize: number;  // Actual position size to use
  leverage: number;            // Leverage to apply
  marginRatio: number;         // Current margin ratio (used/total)
  isValid: boolean;           // Whether the margin requirements are met
  warnings: string[];         // Any warnings about the position
}

export interface AccountMetrics {
  accountValue: number;        // Total account value
  totalMarginUsed: number;     // Total margin currently in use
  totalNtlPos: number;         // Total notional position
  availableBalance: number;    // Available balance for new positions
  currentLeverage: number;     // Current account-wide leverage
  maxAllowedLeverage: number;  // Maximum allowed leverage
}

export interface PositionSizeParams {
  symbol: string;
  accountValue: number;
  currentPrice: number;
  marginPercentage: number;    // % of account to use as margin
  targetLeverage: number;      // Desired leverage (e.g., 5x)
  existingPositionSize?: number;
  existingMarginUsed?: number;
  maxExposure?: number;        // Max % of account in positions
}

export class MarginCalculator {
  // Hyperliquid constraints
  private readonly MIN_ORDER_SIZE = 0.01;
  private readonly MAX_LEVERAGE = 50;
  private readonly DEFAULT_LEVERAGE = 5;
  private readonly MAINTENANCE_MARGIN_RATIO = 0.03; // 3% maintenance margin
  private readonly INITIAL_MARGIN_RATIO = 0.1;      // 10% initial margin at 10x leverage

  // Safety parameters
  private readonly MARGIN_BUFFER = 0.95;  // Use only 95% of available margin
  private readonly MIN_ACCOUNT_BALANCE = 100; // Minimum $100 account balance
  private readonly WARNING_MARGIN_RATIO = 0.8; // Warn at 80% margin usage

  /**
   * Calculate margin requirements for a new position
   */
  calculateMarginRequirements(params: PositionSizeParams): MarginRequirements {
    const warnings: string[] = [];

    // Validate account value
    if (params.accountValue < this.MIN_ACCOUNT_BALANCE) {
      return this.createInvalidRequirements(
        `Account value too low: $${params.accountValue.toFixed(2)}`
      );
    }

    // Calculate available margin
    const totalMarginUsed = params.existingMarginUsed || 0;
    const availableBalance = params.accountValue - totalMarginUsed;
    const availableMargin = availableBalance * this.MARGIN_BUFFER;

    // Calculate desired margin to use
    const desiredMargin = params.accountValue * (params.marginPercentage / 100);

    // Check max exposure limits
    const maxExposure = params.maxExposure || 0.7; // Default 70% max exposure
    const maxAllowedMargin = params.accountValue * maxExposure;
    const newTotalMargin = totalMarginUsed + desiredMargin;

    if (newTotalMargin > maxAllowedMargin) {
      warnings.push(
        `Would exceed max exposure: ${(newTotalMargin / params.accountValue * 100).toFixed(1)}% > ${(maxExposure * 100).toFixed(0)}%`
      );
    }

    // Calculate position size with leverage
    const leverage = Math.min(params.targetLeverage || this.DEFAULT_LEVERAGE, this.MAX_LEVERAGE);
    const marginToUse = Math.min(desiredMargin, availableMargin, maxAllowedMargin - totalMarginUsed);

    if (marginToUse <= 0) {
      return this.createInvalidRequirements('Insufficient available margin');
    }

    const positionValue = marginToUse * leverage;
    const positionSize = positionValue / params.currentPrice;

    // Round position size appropriately
    const actualPositionSize = this.roundPositionSize(positionSize, params.symbol);

    if (actualPositionSize < this.MIN_ORDER_SIZE) {
      return this.createInvalidRequirements(
        `Position size too small: ${actualPositionSize.toFixed(4)} < ${this.MIN_ORDER_SIZE}`
      );
    }

    // Calculate actual margin required
    const actualPositionValue = actualPositionSize * params.currentPrice;
    const requiredMargin = actualPositionValue / leverage;

    // Calculate margin ratio
    const marginRatio = (totalMarginUsed + requiredMargin) / params.accountValue;

    // Add warnings for high margin usage
    if (marginRatio > this.WARNING_MARGIN_RATIO) {
      warnings.push(`High margin usage: ${(marginRatio * 100).toFixed(1)}%`);
    }

    // Check maintenance margin requirements
    const maintenanceMargin = actualPositionValue * this.MAINTENANCE_MARGIN_RATIO;
    if (availableBalance < maintenanceMargin * 2) {
      warnings.push('Close to maintenance margin requirements');
    }

    return {
      requiredMargin,
      availableMargin,
      maxPositionSize: positionSize,
      actualPositionSize,
      leverage,
      marginRatio,
      isValid: true,
      warnings
    };
  }

  /**
   * Calculate safe position size based on account metrics
   */
  calculateSafePositionSize(
    accountValue: number,
    currentPrice: number,
    marginPercentage: number,
    leverage: number = this.DEFAULT_LEVERAGE
  ): number {
    if (accountValue < this.MIN_ACCOUNT_BALANCE) {
      return 0;
    }

    // Apply safety buffer
    const safeAccountValue = accountValue * this.MARGIN_BUFFER;
    const marginToUse = safeAccountValue * (marginPercentage / 100);
    const positionValue = marginToUse * Math.min(leverage, this.MAX_LEVERAGE);
    const positionSize = positionValue / currentPrice;

    return this.roundPositionSize(positionSize);
  }

  /**
   * Check if current margin usage is safe
   */
  checkMarginHealth(metrics: AccountMetrics): {
    isHealthy: boolean;
    marginRatio: number;
    warnings: string[];
    requiresAction: boolean;
  } {
    const warnings: string[] = [];
    let requiresAction = false;

    const marginRatio = metrics.totalMarginUsed / metrics.accountValue;
    const leverageRatio = metrics.totalNtlPos / metrics.accountValue;

    // Check if margin ratio is too high
    if (marginRatio > this.WARNING_MARGIN_RATIO) {
      warnings.push(`High margin ratio: ${(marginRatio * 100).toFixed(1)}%`);
      if (marginRatio > 0.9) {
        requiresAction = true;
        warnings.push('CRITICAL: Margin usage above 90%');
      }
    }

    // Check leverage
    if (leverageRatio > metrics.maxAllowedLeverage) {
      warnings.push(`Leverage exceeds maximum: ${leverageRatio.toFixed(1)}x > ${metrics.maxAllowedLeverage}x`);
      requiresAction = true;
    }

    // Check available balance
    const freeMargin = metrics.accountValue - metrics.totalMarginUsed;
    if (freeMargin < metrics.accountValue * 0.1) {
      warnings.push('Low free margin available');
    }

    return {
      isHealthy: marginRatio < 0.8 && !requiresAction,
      marginRatio,
      warnings,
      requiresAction
    };
  }

  /**
   * Calculate pyramid position sizing
   */
  calculatePyramidSize(
    pyramidLevel: number,
    accountValue: number,
    currentPrice: number,
    marginPercentages: number[],
    leverage: number
  ): {
    size: number;
    margin: number;
    value: number;
  } {
    if (pyramidLevel >= marginPercentages.length) {
      return { size: 0, margin: 0, value: 0 };
    }

    const marginPercentage = marginPercentages[pyramidLevel];
    const margin = accountValue * (marginPercentage / 100);
    const value = margin * leverage;
    const size = this.roundPositionSize(value / currentPrice);

    return { size, margin, value };
  }

  /**
   * Calculate required margin for closing a position
   */
  calculateCloseMargin(
    positionSize: number,
    currentPrice: number,
    isProfit: boolean
  ): number {
    // Hyperliquid doesn't require margin for closing, but we track for safety
    const positionValue = positionSize * currentPrice;

    // If in profit, no additional margin needed
    if (isProfit) {
      return 0;
    }

    // If in loss, might need margin to cover the loss
    // This is a safety check, not a Hyperliquid requirement
    return positionValue * this.MAINTENANCE_MARGIN_RATIO;
  }

  /**
   * Calculate dynamic leverage based on market conditions
   */
  calculateDynamicLeverage(
    baseLevel: number,
    volatility: number,
    accountHealth: number
  ): number {
    // Start with base leverage
    let leverage = baseLevel;

    // Reduce leverage in high volatility
    if (volatility > 0.02) { // 2% volatility
      leverage *= 0.8;
    } else if (volatility > 0.05) { // 5% volatility
      leverage *= 0.6;
    }

    // Reduce leverage if account health is poor
    if (accountHealth < 0.5) {
      leverage *= 0.7;
    }

    // Ensure within bounds
    return Math.max(1, Math.min(leverage, this.MAX_LEVERAGE));
  }

  /**
   * Round position size based on asset requirements
   */
  private roundPositionSize(size: number, symbol?: string): number {
    // SOL-PERP specific rounding
    if (symbol?.includes('SOL')) {
      return Math.floor(size * 100) / 100; // Round down to 2 decimals
    }

    // Default rounding for other assets
    return Math.floor(size * 10000) / 10000; // Round down to 4 decimals
  }

  /**
   * Create invalid margin requirements response
   */
  private createInvalidRequirements(reason: string): MarginRequirements {
    return {
      requiredMargin: 0,
      availableMargin: 0,
      maxPositionSize: 0,
      actualPositionSize: 0,
      leverage: 0,
      marginRatio: 0,
      isValid: false,
      warnings: [reason]
    };
  }

  /**
   * Validate leverage settings
   */
  validateLeverage(leverage: number): {
    isValid: boolean;
    adjustedLeverage: number;
    warning?: string;
  } {
    if (leverage <= 0) {
      return {
        isValid: false,
        adjustedLeverage: this.DEFAULT_LEVERAGE,
        warning: 'Invalid leverage, using default'
      };
    }

    if (leverage > this.MAX_LEVERAGE) {
      return {
        isValid: false,
        adjustedLeverage: this.MAX_LEVERAGE,
        warning: `Leverage too high, capped at ${this.MAX_LEVERAGE}x`
      };
    }

    if (leverage > 20) {
      return {
        isValid: true,
        adjustedLeverage: leverage,
        warning: 'High leverage - increased risk'
      };
    }

    return {
      isValid: true,
      adjustedLeverage: leverage
    };
  }

  /**
   * Calculate stop loss price based on margin
   */
  calculateStopLoss(
    entryPrice: number,
    leverage: number,
    maxLossPercentage: number = 10
  ): {
    stopPrice: number;
    lossAmount: number;
    lossPercentage: number;
  } {
    // With leverage, a small price move causes larger P&L
    // Stop loss = Entry * (1 - (maxLoss% / leverage))
    const priceChangePercent = maxLossPercentage / leverage;
    const stopPrice = entryPrice * (1 - priceChangePercent / 100);
    const lossPercentage = priceChangePercent;

    return {
      stopPrice,
      lossAmount: (entryPrice - stopPrice) * leverage,
      lossPercentage
    };
  }

  /**
   * Get margin configuration for logging
   */
  getConfig() {
    return {
      MIN_ORDER_SIZE: this.MIN_ORDER_SIZE,
      MAX_LEVERAGE: this.MAX_LEVERAGE,
      DEFAULT_LEVERAGE: this.DEFAULT_LEVERAGE,
      MAINTENANCE_MARGIN_RATIO: this.MAINTENANCE_MARGIN_RATIO,
      INITIAL_MARGIN_RATIO: this.INITIAL_MARGIN_RATIO,
      MARGIN_BUFFER: this.MARGIN_BUFFER,
      MIN_ACCOUNT_BALANCE: this.MIN_ACCOUNT_BALANCE,
      WARNING_MARGIN_RATIO: this.WARNING_MARGIN_RATIO
    };
  }
}

// Export singleton instance
export const marginCalculator = new MarginCalculator();