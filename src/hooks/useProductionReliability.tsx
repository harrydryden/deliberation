/**
 * Production Reliability Hook - Integrates all reliability systems
 */
import { useEffect, useRef } from 'react';
import { useEnhancedMemoryManager } from './useEnhancedMemoryManager';
import { enhancedHealthMonitor } from '@/services/enhanced-health-monitor.service';
import { systemMonitor } from '@/services/system-monitoring.service';
import { EnhancedErrorRecoveryService } from '@/services/enhanced-error-recovery.service';
import { logger } from '@/utils/logger';

interface ReliabilityConfig {
  enableMemoryMonitoring: boolean;
  enableHealthMonitoring: boolean;
  enableErrorRecovery: boolean;
  memoryThresholdMB: number;
  healthCheckInterval: number;
  componentName: string;
}

const DEFAULT_CONFIG: ReliabilityConfig = {
  enableMemoryMonitoring: true,
  enableHealthMonitoring: true,
  enableErrorRecovery: true,
  memoryThresholdMB: 100,
  healthCheckInterval: 60000,
  componentName: 'UnknownComponent'
};

export const useProductionReliability = (
  config: Partial<ReliabilityConfig> = {}
) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const isInitialized = useRef(false);

  // Enhanced memory management
  const memoryManager = useEnhancedMemoryManager(
    finalConfig.componentName,
    {
      thresholdMB: finalConfig.memoryThresholdMB,
      autoCleanup: true,
      aggressiveMode: false
    }
  );

  // Initialize reliability systems
  useEffect(() => {
    if (isInitialized.current) return;

    logger.info('Initializing production reliability systems', {
      component: finalConfig.componentName,
      config: finalConfig
    });

    // Start health monitoring if enabled
    if (finalConfig.enableHealthMonitoring) {
      enhancedHealthMonitor.startMonitoring();
    }

    // Start system monitoring
    systemMonitor.startMonitoring();

    // Register component-specific cleanup tasks
    memoryManager.registerCleanupTask({
      id: 'system_cleanup',
      callback: () => {
        logger.debug('Performing system cleanup for reliability');
      },
      priority: 'medium',
      description: 'System-level cleanup for reliability'
    });

    isInitialized.current = true;

    return () => {
      logger.info('Shutting down reliability systems', {
        component: finalConfig.componentName
      });

      if (finalConfig.enableHealthMonitoring) {
        enhancedHealthMonitor.stopMonitoring();
      }
      systemMonitor.stopMonitoring();
    };
  }, [finalConfig, memoryManager]);

  // Wrap functions with error recovery
  const withErrorRecovery = <T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context?: string
  ) => {
    return (...args: T): Promise<R> => {
      if (!finalConfig.enableErrorRecovery) {
        return fn(...args);
      }

      return EnhancedErrorRecoveryService.withComprehensiveRecovery(
        () => fn(...args),
        {
          context: context || `${finalConfig.componentName}_operation`,
          retryConfig: {
            maxRetries: 2,
            baseDelay: 1000
          }
        }
      );
    };
  };

  // Enhanced event tracking
  const trackReliabilityEvent = (event: string, data?: any) => {
    systemMonitor.trackEvent(`reliability_${event}`, {
      component: finalConfig.componentName,
      timestamp: new Date().toISOString(),
      ...data
    });
  };

  // Health check helper
  const performHealthCheck = async () => {
    const healthReport = await enhancedHealthMonitor.runHealthCheck();
    const memoryStats = memoryManager.getMemoryStats();
    
    trackReliabilityEvent('health_check_completed', {
      healthStatus: healthReport.overall,
      memoryUsage: memoryStats?.usagePercent,
      isUnderMemoryPressure: memoryManager.isUnderPressure
    });

    return {
      health: healthReport,
      memory: memoryStats,
      isHealthy: healthReport.overall === 'healthy' && !memoryManager.isUnderPressure
    };
  };

  return {
    // Memory management
    memoryManager,
    
    // Error recovery
    withErrorRecovery,
    
    // Monitoring
    trackEvent: trackReliabilityEvent,
    performHealthCheck,
    
    // Resource tracking helpers
    trackInterval: memoryManager.trackInterval,
    trackTimeout: memoryManager.trackTimeout,
    trackEventListener: memoryManager.trackEventListener,
    trackObserver: memoryManager.trackObserver,
    trackAbortController: memoryManager.trackAbortController,
    trackSubscription: memoryManager.trackSubscription,
    
    // Cleanup
    registerCleanupTask: memoryManager.registerCleanupTask,
    forceCleanup: memoryManager.executeCleanup,
    
    // Status
    isHealthy: () => enhancedHealthMonitor.isHealthy() && !memoryManager.isUnderPressure,
    getReliabilityStatus: () => ({
      memory: memoryManager.memoryStats,
      health: enhancedHealthMonitor.getLastHealthReport(),
      resourceCount: memoryManager.getResourceCount()
    })
  };
};