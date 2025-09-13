/**
 * Health Monitor - Minimal implementation
 */

export const healthMonitor = {
  checkHealth: () => {
    return { status: 'healthy' };
  },
  reportMetric: (name: string, value: number) => {
    // No-op for now
  },
  startMonitoring: () => {
    // No-op for now
  },
  stopMonitoring: () => {
    // No-op for now
  },
  forceHealthCheck: () => {
    return { status: 'healthy' };
  },
  getHealthStatus: () => {
    return { status: 'healthy' };
  }
};