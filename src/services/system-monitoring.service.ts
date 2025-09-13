/**
 * System Monitoring Service - Minimal implementation
 */

export const systemMonitoringService = {
  trackEvent: (event: string, data?: any) => {
    // No-op for now
  },
  trackError: (error: Error, context?: any) => {
    console.error('System error:', error, context);
  }
};

export const systemMonitor = systemMonitoringService;