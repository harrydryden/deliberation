// Production health monitoring hook
import { useEffect, useState } from 'react';
import { healthMonitor } from '@/utils/health-monitor';
import { createComponentLogger } from '@/utils/productionLogger';

const logger = createComponentLogger('useProductionHealthMonitor');

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: any[];
  summary: Record<string, number>;
}

export const useProductionHealthMonitor = (enabled: boolean = true) => {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    if (!enabled) {
      if (isMonitoring) {
        healthMonitor.stopMonitoring();
        setIsMonitoring(false);
      }
      return;
    }

    if (!isMonitoring) {
      // Start monitoring with 60 second intervals in production
      const intervalMs = process.env.NODE_ENV === 'production' ? 60000 : 30000;
      healthMonitor.startMonitoring(intervalMs);
      setIsMonitoring(true);
      logger.info('Health monitoring started', { intervalMs });
    }

    // Initial health check
    healthMonitor.forceHealthCheck().then(() => {
      setHealthStatus(healthMonitor.getHealthStatus());
    });

    // Set up periodic status updates
    const statusInterval = setInterval(() => {
      setHealthStatus(healthMonitor.getHealthStatus());
    }, 30000); // Update UI every 30 seconds

    return () => {
      clearInterval(statusInterval);
    };
  }, [enabled, isMonitoring]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isMonitoring) {
        healthMonitor.stopMonitoring();
        setIsMonitoring(false);
      }
    };
  }, []);

  const forceHealthCheck = async () => {
    await healthMonitor.forceHealthCheck();
    setHealthStatus(healthMonitor.getHealthStatus());
  };

  return {
    healthStatus,
    isMonitoring,
    forceHealthCheck
  };
};