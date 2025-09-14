/**
 * Enhanced System Monitoring Service - Production Ready
 */
import { enhancedHealthMonitor } from './enhanced-health-monitor.service';
import { logger } from '@/utils/logger';
import { enhancedErrorReporting } from '@/utils/enhancedErrorReporting';

class SystemMonitoringService {
  private metricsBuffer: Array<{ event: string; data: any; timestamp: number }> = [];
  private readonly MAX_BUFFER_SIZE = 1000;

  trackEvent = (event: string, data?: any) => {
    const entry = {
      event,
      data,
      timestamp: Date.now()
    };

    this.metricsBuffer.push(entry);
    
    // Keep buffer size manageable
    if (this.metricsBuffer.length > this.MAX_BUFFER_SIZE) {
      this.metricsBuffer = this.metricsBuffer.slice(-this.MAX_BUFFER_SIZE / 2);
    }

    logger.debug('Event tracked', entry);
  };

  trackError = (error: Error, context?: any) => {
    enhancedErrorReporting.captureException(error, {
      ...context,
      systemMonitoring: true,
      timestamp: new Date().toISOString()
    });

    this.trackEvent('system_error', {
      error: error.message,
      stack: error.stack,
      context
    });
  };

  getHealthStatus = async () => {
    return enhancedHealthMonitor.runHealthCheck();
  };

  getMetrics = () => {
    return {
      bufferSize: this.metricsBuffer.length,
      recentEvents: this.metricsBuffer.slice(-10),
      healthStatus: enhancedHealthMonitor.getLastHealthReport()
    };
  };

  startMonitoring = () => {
    enhancedHealthMonitor.startMonitoring();
    logger.info('System monitoring started');
  };

  stopMonitoring = () => {
    enhancedHealthMonitor.stopMonitoring();
    logger.info('System monitoring stopped');
  };
}

export const systemMonitoringService = new SystemMonitoringService();
export const systemMonitor = systemMonitoringService;