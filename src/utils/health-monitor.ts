/**
 * Enhanced Health Monitor - Production Ready Implementation
 */
export { enhancedHealthMonitor as healthMonitor } from '@/services/enhanced-health-monitor.service';

// Backward compatibility
export const healthMonitorLegacy = {
  checkHealth: () => ({ status: 'healthy' }),
  reportMetric: () => {},
  startMonitoring: () => {},
  stopMonitoring: () => {},
  forceHealthCheck: () => ({ status: 'healthy' }),
  getHealthStatus: () => ({ status: 'healthy' })
};