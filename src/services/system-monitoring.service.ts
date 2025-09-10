/**
 * Centralized System Monitoring Service
 * Provides monitoring, alerting, and health checks for the application
 */

import { logger } from '@/utils/logger';

interface SystemHealth {
  overallStatus: 'healthy' | 'warning' | 'critical';
  components: {
    messageProcessing: ComponentHealth;
    agentOrchestration: ComponentHealth;
    streaming: ComponentHealth;
    cache: ComponentHealth;
  };
  metrics: {
    activeStreams: number;
    messageLocks: number;
    cacheHitRate: number;
    averageResponseTime: number;
  };
  timestamp: Date;
}

interface ComponentHealth {
  status: 'healthy' | 'warning' | 'critical';
  lastCheck: Date;
  errorCount: number;
  warningCount: number;
  details?: string;
}

interface PerformanceMetrics {
  operation: string;
  duration: number;
  success: boolean;
  timestamp: Date;
  context?: Record<string, any>;
}

export class SystemMonitoringService {
  private static instance: SystemMonitoringService;
  private metrics: PerformanceMetrics[] = [];
  private componentHealthChecks = new Map<string, ComponentHealth>();
  private alertCallbacks: Array<(alert: SystemAlert) => void> = [];
  
  private readonly MAX_METRICS_HISTORY = 1000;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private healthCheckInterval: NodeJS.Timeout | null = null;

  public static getInstance(): SystemMonitoringService {
    if (!SystemMonitoringService.instance) {
      SystemMonitoringService.instance = new SystemMonitoringService();
    }
    return SystemMonitoringService.instance;
  }

  private constructor() {
    this.startHealthChecking();
  }

  /**
   * Record a performance metric
   */
  recordMetric(operation: string, duration: number, success: boolean, context?: Record<string, any>) {
    const metric: PerformanceMetrics = {
      operation,
      duration,
      success,
      timestamp: new Date(),
      context,
    };

    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS_HISTORY);
    }

    // Check for performance alerts
    this.checkPerformanceAlerts(metric);
  }

  /**
   * Update component health status
   */
  updateComponentHealth(
    component: string, 
    status: ComponentHealth['status'], 
    details?: string
  ) {
    const existing = this.componentHealthChecks.get(component);
    
    const health: ComponentHealth = {
      status,
      lastCheck: new Date(),
      errorCount: existing?.errorCount || 0,
      warningCount: existing?.warningCount || 0,
      details,
    };

    if (status === 'critical') {
      health.errorCount = (existing?.errorCount || 0) + 1;
    } else if (status === 'warning') {
      health.warningCount = (existing?.warningCount || 0) + 1;
    }

    this.componentHealthChecks.set(component, health);

    // Trigger alert if critical
    if (status === 'critical') {
      this.triggerAlert({
        severity: 'critical',
        component,
        message: `Component ${component} is in critical state: ${details}`,
        timestamp: new Date(),
        context: { componentHealth: health },
      });
    }
  }

  /**
   * Get current system health status
   */
  getSystemHealth(): SystemHealth {
    const components = {
      messageProcessing: this.componentHealthChecks.get('messageProcessing') || this.getDefaultHealth(),
      agentOrchestration: this.componentHealthChecks.get('agentOrchestration') || this.getDefaultHealth(),
      streaming: this.componentHealthChecks.get('streaming') || this.getDefaultHealth(),
      cache: this.componentHealthChecks.get('cache') || this.getDefaultHealth(),
    };

    // Calculate overall status
    const componentStatuses = Object.values(components).map(c => c.status);
    const overallStatus = componentStatuses.includes('critical') 
      ? 'critical' 
      : componentStatuses.includes('warning') 
        ? 'warning' 
        : 'healthy';

    // Calculate metrics
    const recentMetrics = this.getRecentMetrics(5 * 60 * 1000); // Last 5 minutes
    const successfulMetrics = recentMetrics.filter(m => m.success);
    const averageResponseTime = successfulMetrics.length > 0
      ? successfulMetrics.reduce((sum, m) => sum + m.duration, 0) / successfulMetrics.length
      : 0;

    return {
      overallStatus,
      components,
      metrics: {
        activeStreams: this.getActiveStreamCount(),
        messageLocks: this.getMessageLockCount(),
        cacheHitRate: this.getCacheHitRate(),
        averageResponseTime,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Add alert callback
   */
  onAlert(callback: (alert: SystemAlert) => void) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get performance metrics for analysis
   */
  getPerformanceMetrics(operation?: string, timeRangeMs: number = 3600000): PerformanceMetrics[] {
    const cutoff = Date.now() - timeRangeMs;
    return this.metrics
      .filter(m => m.timestamp.getTime() > cutoff)
      .filter(m => !operation || m.operation === operation);
  }

  /**
   * Start automated health checking
   */
  private startHealthChecking() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Perform automated health checks
   */
  private performHealthChecks() {
    try {
      // Check for stale metrics (components not reporting)
      const staleThreshold = Date.now() - (2 * this.HEALTH_CHECK_INTERVAL);
      
      for (const [component, health] of this.componentHealthChecks) {
        if (health.lastCheck.getTime() < staleThreshold) {
          this.updateComponentHealth(component, 'warning', 'No recent health reports');
        }
      }

      // Check for performance degradation
      const recentMetrics = this.getRecentMetrics(5 * 60 * 1000);
      const failureRate = recentMetrics.length > 0 
        ? recentMetrics.filter(m => !m.success).length / recentMetrics.length 
        : 0;

      if (failureRate > 0.2) { // 20% failure rate
        this.updateComponentHealth('system', 'warning', `High failure rate: ${Math.round(failureRate * 100)}%`);
      }

    } catch (error) {
      logger.error('Health check failed', error as Error);
    }
  }

  /**
   * Check for performance-based alerts
   */
  private checkPerformanceAlerts(metric: PerformanceMetrics) {
    // Alert on slow operations
    if (metric.success && metric.duration > 30000) { // 30 seconds
      this.triggerAlert({
        severity: 'warning',
        component: 'performance',
        message: `Slow operation detected: ${metric.operation} took ${metric.duration}ms`,
        timestamp: new Date(),
        context: { metric },
      });
    }

    // Alert on failures
    if (!metric.success) {
      this.triggerAlert({
        severity: 'warning',
        component: 'performance',
        message: `Operation failed: ${metric.operation}`,
        timestamp: new Date(),
        context: { metric },
      });
    }
  }

  /**
   * Trigger system alert
   */
  private triggerAlert(alert: SystemAlert) {
    logger.warn('System alert triggered', alert);
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Alert callback failed', error as Error);
      }
    });
  }

  /**
   * Helper methods
   */
  private getDefaultHealth(): ComponentHealth {
    return {
      status: 'healthy',
      lastCheck: new Date(),
      errorCount: 0,
      warningCount: 0,
    };
  }

  private getRecentMetrics(timeRangeMs: number): PerformanceMetrics[] {
    const cutoff = Date.now() - timeRangeMs;
    return this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  private getActiveStreamCount(): number {
    // This would be integrated with actual stream monitoring
    return 0;
  }

  private getMessageLockCount(): number {
    // This would be integrated with MessageProcessingLockManager
    return 0;
  }

  private getCacheHitRate(): number {
    // This would be integrated with cache service
    return 0;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.alertCallbacks = [];
    this.metrics = [];
    this.componentHealthChecks.clear();
  }
}

export interface SystemAlert {
  severity: 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
}

// Export singleton instance
export const systemMonitor = SystemMonitoringService.getInstance();
