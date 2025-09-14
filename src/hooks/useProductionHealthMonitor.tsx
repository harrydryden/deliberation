// Production health monitoring hook
import { useEffect, useState } from 'react';
import { healthMonitor } from '@/utils/health-monitor';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useProductionHealthMonitor');

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
      const intervalMs = import.meta.env.MODE === 'production' ? 60000 : 30000;
      healthMonitor.startMonitoring();
      setIsMonitoring(true);
      logger.info('Health monitoring started', { intervalMs });
    }

    // Initial health check
    healthMonitor.runHealthCheck().then(healthResult => {
      setHealthStatus(healthResult as any);
    }).catch(error => {
      logger.error('Initial health check failed', error);
    });

    // Set up periodic status updates
    const statusInterval = setInterval(() => {
      const lastReport = healthMonitor.getLastHealthReport();
      if (lastReport) {
        setHealthStatus(lastReport as any);
      }
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
    try {
      const result = await healthMonitor.runHealthCheck();
      setHealthStatus(result as any);
    } catch (error) {
      logger.error('Force health check failed', error as Error);
    }
  };

  return {
    healthStatus,
    isMonitoring,
    forceHealthCheck
  };
};