import { useCallback, useRef, useEffect } from 'react';
import { productionLogger } from '@/utils/productionLogger';

interface HealthMonitorConfig {
  heartbeatIntervalMs: number;
  stallDetectionMs: number;
  maxConsecutiveFailures: number;
}

interface StreamHealth {
  lastActivity: number;
  consecutiveFailures: number;
  totalBytesReceived: number;
  isHealthy: boolean;
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  heartbeatIntervalMs: 5000,
  stallDetectionMs: 20000,
  maxConsecutiveFailures: 3,
};

/**
 * Health monitoring hook for streaming connections
 * Detects stalled connections and provides automatic recovery
 */
export const useStreamHealthMonitor = (config: Partial<HealthMonitorConfig> = {}) => {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const healthRef = useRef<StreamHealth>({
    lastActivity: Date.now(),
    consecutiveFailures: 0,
    totalBytesReceived: 0,
    isHealthy: true,
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onStallRef = useRef<(() => void) | null>(null);

  const startHealthMonitoring = useCallback((onStall?: () => void) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    onStallRef.current = onStall || null;
    healthRef.current.lastActivity = Date.now();
    healthRef.current.consecutiveFailures = 0;
    healthRef.current.isHealthy = true;
    
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - healthRef.current.lastActivity;
      
      if (timeSinceActivity > fullConfig.stallDetectionMs) {
        healthRef.current.consecutiveFailures++;
        healthRef.current.isHealthy = false;
        
        productionLogger.warn('Stream stall detected', {
          timeSinceActivity,
          consecutiveFailures: healthRef.current.consecutiveFailures,
          totalBytes: healthRef.current.totalBytesReceived,
        });
        
        if (healthRef.current.consecutiveFailures >= fullConfig.maxConsecutiveFailures) {
          productionLogger.error('Stream health critical - triggering recovery', {
            consecutiveFailures: healthRef.current.consecutiveFailures,
          });
          
          if (onStallRef.current) {
            onStallRef.current();
          }
        }
      } else {
        // Reset on activity
        if (healthRef.current.consecutiveFailures > 0) {
          productionLogger.info('Stream health recovered', {
            previousFailures: healthRef.current.consecutiveFailures,
          });
        }
        healthRef.current.consecutiveFailures = 0;
        healthRef.current.isHealthy = true;
      }
    }, fullConfig.heartbeatIntervalMs);
  }, [fullConfig]);

  const recordActivity = useCallback((bytesReceived: number = 0) => {
    healthRef.current.lastActivity = Date.now();
    healthRef.current.totalBytesReceived += bytesReceived;
    healthRef.current.isHealthy = true;
  }, []);

  const stopHealthMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onStallRef.current = null;
  }, []);

  const getHealthStats = useCallback(() => ({
    isHealthy: healthRef.current.isHealthy,
    lastActivity: healthRef.current.lastActivity,
    consecutiveFailures: healthRef.current.consecutiveFailures,
    totalBytesReceived: healthRef.current.totalBytesReceived,
    timeSinceActivity: Date.now() - healthRef.current.lastActivity,
  }), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHealthMonitoring();
    };
  }, [stopHealthMonitoring]);

  return {
    startHealthMonitoring,
    recordActivity,
    stopHealthMonitoring,
    getHealthStats,
  };
};