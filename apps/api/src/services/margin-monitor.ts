import { PrismaClient } from '@prisma/client';
import { HyperliquidClient } from './hyperliquid-client';
import { marginCalculator, AccountMetrics } from './margin-calculator';
import { leverageManager } from './leverage-manager';
import { logger } from '../lib/logger';
import { WebSocketService } from './websocket';

/**
 * Margin Monitor Service
 *
 * Continuously monitors margin health and takes preventive actions
 * to protect the account from liquidation
 */

export interface MarginAlert {
  level: 'info' | 'warning' | 'critical' | 'emergency';
  message: string;
  marginRatio: number;
  availableMargin: number;
  action?: 'reduce_position' | 'close_position' | 'adjust_leverage' | 'none';
  timestamp: Date;
}

export interface MarginStatus {
  isHealthy: boolean;
  marginRatio: number;
  availableMargin: number;
  totalMarginUsed: number;
  accountValue: number;
  alerts: MarginAlert[];
  requiresAction: boolean;
  lastCheck: Date;
}

export class MarginMonitor {
  private monitoringInterval?: NodeJS.Timeout;
  private alertHistory: MarginAlert[] = [];
  private lastEmergencyAction: Date | null = null;
  private emergencyActionCooldown = 300000; // 5 minutes
  private isMonitoring = false;

  // Alert thresholds
  private readonly THRESHOLDS = {
    info: 0.5,      // 50% margin usage - informational
    warning: 0.7,   // 70% margin usage - warning
    critical: 0.85, // 85% margin usage - critical
    emergency: 0.95 // 95% margin usage - emergency action
  };

  constructor(
    private prisma: PrismaClient,
    private wsService: WebSocketService
  ) {}

  /**
   * Start monitoring margin health
   */
  startMonitoring(client: HyperliquidClient, intervalMs: number = 5000): void {
    if (this.isMonitoring) {
      logger.info('Margin monitor already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting margin monitor', { interval: intervalMs });

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkMarginHealth(client);
      } catch (error) {
        logger.error('Error in margin monitoring cycle', error);
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.isMonitoring = false;
      logger.info('Margin monitor stopped');
    }
  }

  /**
   * Check current margin health
   */
  async checkMarginHealth(client: HyperliquidClient): Promise<MarginStatus> {
    try {
      // Get account metrics
      const accountValue = await client.getAccountValue();
      const positions = await client.getPositions();

      // Calculate margin metrics
      const totalMarginUsed = this.calculateTotalMarginUsed(positions, accountValue);
      const availableMargin = accountValue - totalMarginUsed;
      const marginRatio = accountValue > 0 ? totalMarginUsed / accountValue : 0;

      // Build account metrics for health check
      const metrics: AccountMetrics = {
        accountValue,
        totalMarginUsed,
        totalNtlPos: this.calculateTotalNotional(positions),
        availableBalance: availableMargin,
        currentLeverage: this.calculateCurrentLeverage(positions, accountValue),
        maxAllowedLeverage: 10
      };

      // Check health using margin calculator
      const healthCheck = marginCalculator.checkMarginHealth(metrics);

      // Generate alerts based on margin ratio
      const alerts = this.generateAlerts(marginRatio, availableMargin, accountValue);

      // Take action if necessary
      if (healthCheck.requiresAction) {
        await this.handleMarginAction(client, marginRatio, positions, alerts);
      }

      // Broadcast status via WebSocket
      const status: MarginStatus = {
        isHealthy: healthCheck.isHealthy,
        marginRatio,
        availableMargin,
        totalMarginUsed,
        accountValue,
        alerts,
        requiresAction: healthCheck.requiresAction,
        lastCheck: new Date()
      };

      // Send update to all connected clients
      this.wsService.broadcastMarginUpdate(status);

      // Store critical alerts
      if (alerts.some(a => a.level === 'critical' || a.level === 'emergency')) {
        this.alertHistory.push(...alerts.filter(a =>
          a.level === 'critical' || a.level === 'emergency'
        ));
        // Keep only last 100 alerts
        if (this.alertHistory.length > 100) {
          this.alertHistory = this.alertHistory.slice(-100);
        }
      }

      return status;

    } catch (error) {
      logger.error('Error checking margin health', error);
      throw error;
    }
  }

  /**
   * Generate alerts based on margin levels
   */
  private generateAlerts(
    marginRatio: number,
    availableMargin: number,
    accountValue: number
  ): MarginAlert[] {
    const alerts: MarginAlert[] = [];
    const timestamp = new Date();

    if (marginRatio >= this.THRESHOLDS.emergency) {
      alerts.push({
        level: 'emergency',
        message: `EMERGENCY: Margin ratio at ${(marginRatio * 100).toFixed(1)}% - Immediate action required`,
        marginRatio,
        availableMargin,
        action: 'close_position',
        timestamp
      });
    } else if (marginRatio >= this.THRESHOLDS.critical) {
      alerts.push({
        level: 'critical',
        message: `Critical margin level: ${(marginRatio * 100).toFixed(1)}% - Consider reducing positions`,
        marginRatio,
        availableMargin,
        action: 'reduce_position',
        timestamp
      });
    } else if (marginRatio >= this.THRESHOLDS.warning) {
      alerts.push({
        level: 'warning',
        message: `High margin usage: ${(marginRatio * 100).toFixed(1)}% - Monitor closely`,
        marginRatio,
        availableMargin,
        action: 'adjust_leverage',
        timestamp
      });
    } else if (marginRatio >= this.THRESHOLDS.info) {
      alerts.push({
        level: 'info',
        message: `Margin usage: ${(marginRatio * 100).toFixed(1)}% - Within normal range`,
        marginRatio,
        availableMargin,
        action: 'none',
        timestamp
      });
    }

    // Additional checks
    if (availableMargin < accountValue * 0.1) {
      alerts.push({
        level: 'warning',
        message: `Low available margin: $${availableMargin.toFixed(2)}`,
        marginRatio,
        availableMargin,
        action: 'none',
        timestamp
      });
    }

    return alerts;
  }

  /**
   * Handle margin actions based on alerts
   */
  private async handleMarginAction(
    client: HyperliquidClient,
    marginRatio: number,
    positions: any[],
    alerts: MarginAlert[]
  ): Promise<void> {
    const emergencyAlert = alerts.find(a => a.level === 'emergency');
    const criticalAlert = alerts.find(a => a.level === 'critical');

    // Handle emergency situation
    if (emergencyAlert) {
      await this.handleEmergencyAction(client, positions, marginRatio);
    }
    // Handle critical situation
    else if (criticalAlert) {
      await this.handleCriticalAction(client, positions, marginRatio);
    }
    // Handle warning by adjusting leverage
    else if (alerts.some(a => a.level === 'warning')) {
      await this.adjustLeverageForSafety(client, positions);
    }
  }

  /**
   * Handle emergency margin situation
   */
  private async handleEmergencyAction(
    client: HyperliquidClient,
    positions: any[],
    marginRatio: number
  ): Promise<void> {
    // Check cooldown
    if (this.lastEmergencyAction) {
      const timeSinceLastAction = Date.now() - this.lastEmergencyAction.getTime();
      if (timeSinceLastAction < this.emergencyActionCooldown) {
        logger.warn('Emergency action on cooldown', {
          cooldownRemaining: (this.emergencyActionCooldown - timeSinceLastAction) / 1000
        });
        return;
      }
    }

    logger.error('⛔ EMERGENCY MARGIN ACTION TRIGGERED', {
      marginRatio: (marginRatio * 100).toFixed(1) + '%',
      positions: positions.length
    });

    // Find the largest position to close
    const sortedPositions = positions
      .map(p => ({
        ...p,
        value: Math.abs(parseFloat(p.szi || '0')) * parseFloat(p.entryPx || '0')
      }))
      .sort((a, b) => b.value - a.value);

    if (sortedPositions.length > 0) {
      const positionToClose = sortedPositions[0];

      logger.warn(`Closing largest position: ${positionToClose.coin}`, {
        size: positionToClose.szi,
        value: positionToClose.value.toFixed(2)
      });

      try {
        await client.closePosition(positionToClose.coin);
        this.lastEmergencyAction = new Date();

        // Notify via WebSocket
        this.wsService.broadcastAlert({
          type: 'emergency_close',
          symbol: positionToClose.coin,
          reason: 'Margin ratio exceeded emergency threshold',
          marginRatio
        });

      } catch (error) {
        logger.error('Failed to execute emergency close', error);
      }
    }
  }

  /**
   * Handle critical margin situation
   */
  private async handleCriticalAction(
    client: HyperliquidClient,
    positions: any[],
    marginRatio: number
  ): Promise<void> {
    logger.warn('⚠️ Critical margin level - reducing positions', {
      marginRatio: (marginRatio * 100).toFixed(1) + '%'
    });

    // Reduce largest position by 50%
    const largestPosition = positions
      .map(p => ({
        ...p,
        size: Math.abs(parseFloat(p.szi || '0')),
        value: Math.abs(parseFloat(p.szi || '0')) * parseFloat(p.entryPx || '0')
      }))
      .sort((a, b) => b.value - a.value)[0];

    if (largestPosition && largestPosition.size > 0.01) {
      const reduceSize = largestPosition.size * 0.5;

      logger.info(`Reducing position ${largestPosition.coin} by 50%`, {
        currentSize: largestPosition.size.toFixed(4),
        reduceBy: reduceSize.toFixed(4)
      });

      try {
        await client.placeOrder({
          coin: largestPosition.coin,
          is_buy: parseFloat(largestPosition.szi) < 0, // Opposite of position
          sz: reduceSize,
          order_type: 'market',
          reduce_only: true
        });

        // Notify via WebSocket
        this.wsService.broadcastAlert({
          type: 'position_reduced',
          symbol: largestPosition.coin,
          reason: 'Critical margin level',
          marginRatio,
          reducePercentage: 50
        });

      } catch (error) {
        logger.error('Failed to reduce position', error);
      }
    }
  }

  /**
   * Adjust leverage for safety
   */
  private async adjustLeverageForSafety(
    client: HyperliquidClient,
    positions: any[]
  ): Promise<void> {
    for (const position of positions) {
      const symbol = position.coin;
      const currentLeverage = parseFloat(position.leverage || '1');

      if (currentLeverage > 5) {
        logger.info(`Reducing leverage for ${symbol}`, {
          current: currentLeverage,
          target: 5
        });

        try {
          await leverageManager.monitorAndAdjustLeverage(client, symbol);
        } catch (error) {
          logger.error(`Failed to adjust leverage for ${symbol}`, error);
        }
      }
    }
  }

  /**
   * Calculate total margin used
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
   * Calculate total notional value
   */
  private calculateTotalNotional(positions: any[]): number {
    let total = 0;

    for (const position of positions) {
      const size = Math.abs(parseFloat(position.szi || '0'));
      const entryPrice = parseFloat(position.entryPx || '0');

      if (size > 0 && entryPrice > 0) {
        total += size * entryPrice;
      }
    }

    return total;
  }

  /**
   * Calculate current account leverage
   */
  private calculateCurrentLeverage(positions: any[], accountValue: number): number {
    const totalNotional = this.calculateTotalNotional(positions);
    return accountValue > 0 ? totalNotional / accountValue : 0;
  }

  /**
   * Get current status
   */
  async getCurrentStatus(client: HyperliquidClient): Promise<MarginStatus> {
    return this.checkMarginHealth(client);
  }

  /**
   * Get alert history
   */
  getAlertHistory(): MarginAlert[] {
    return [...this.alertHistory];
  }

  /**
   * Clear alert history
   */
  clearAlertHistory(): void {
    this.alertHistory = [];
    logger.info('Alert history cleared');
  }

  /**
   * Check if monitoring is active
   */
  isActive(): boolean {
    return this.isMonitoring;
  }
}

// Export singleton instance
export const createMarginMonitor = (
  prisma: PrismaClient,
  wsService: WebSocketService
) => new MarginMonitor(prisma, wsService);