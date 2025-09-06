// Memory monitoring and leak detection hook
import { useEffect, useRef, useCallback } from 'react';
import { logger } from '@/utils/logger';

interface MemoryStats {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

interface UseMemoryMonitorOptions {
  componentName: string;
  warningThreshold?: number; // MB
  criticalThreshold?: number; // MB
  sampleInterval?: number; // ms
}

export const useMemoryMonitor = (options: UseMemoryMonitorOptions) => {
  const {
    componentName,
    warningThreshold = 50, // 50MB
    criticalThreshold = 100, // 100MB
    sampleInterval = 10000 // 10 seconds
  } = options;

  // Disable memory monitoring in production
  if (process.env.NODE_ENV === 'production') {
    return {
      getMemoryStats: () => ({}),
      checkMemoryUsage: () => null,
      forceGarbageCollection: () => false
    };
  }

  const initialMemoryRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout>();
  const mountTimeRef = useRef<number>(Date.now());

  // Get current memory usage
  const getMemoryStats = useCallback((): MemoryStats => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const memory = (performance as any).memory;
      if (memory) {
        return {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit
        };
      }
    }
    return {};
  }, []);

  // Check for memory leaks
  const checkMemoryUsage = useCallback(() => {
    const stats = getMemoryStats();
    
    if (stats.usedJSHeapSize) {
      const currentUsage = stats.usedJSHeapSize / (1024 * 1024); // Convert to MB
      const increase = currentUsage - (initialMemoryRef.current / (1024 * 1024));
      
      const lifespan = Date.now() - mountTimeRef.current;
      
      // Log memory usage
      logger.performance.mark(`Memory usage: ${componentName}`, {
        current: `${currentUsage.toFixed(2)}MB`,
        increase: `${increase.toFixed(2)}MB`,
        lifespan: `${lifespan}ms`
      });
      
      // Warn about high memory usage
      if (increase > warningThreshold && increase < criticalThreshold) {
        logger.warn(`High memory usage detected in ${componentName}`, {
          increase: `${increase.toFixed(2)}MB`,
          current: `${currentUsage.toFixed(2)}MB`,
          threshold: `${warningThreshold}MB`
        });
      }
      
      // Critical memory usage
      if (increase > criticalThreshold) {
        logger.error(`Critical memory usage detected in ${componentName}`, {
          increase: `${increase.toFixed(2)}MB`,
          current: `${currentUsage.toFixed(2)}MB`,
          threshold: `${criticalThreshold}MB`
        });
        
        // Suggest garbage collection if available
        if ('gc' in window && typeof (window as any).gc === 'function') {
          (window as any).gc();
        }
      }
      
      return { currentUsage, increase, stats };
    }
    
    return null;
  }, [componentName, warningThreshold, criticalThreshold]);

  // Force garbage collection (if available)
  const forceGarbageCollection = useCallback(() => {
    if (typeof window !== 'undefined' && 'gc' in window && typeof (window as any).gc === 'function') {
      try {
        (window as any).gc();
        logger.info(`Forced garbage collection for ${componentName}`);
        return true;
      } catch (error) {
        logger.error('Failed to force garbage collection', error as Error);
        return false;
      }
    }
    return false;
  }, [componentName]);

  // Start monitoring (only in development)
  useEffect(() => {
    // Skip monitoring in production
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    const stats = getMemoryStats();
    if (stats.usedJSHeapSize) {
      initialMemoryRef.current = stats.usedJSHeapSize;
    }

    // Set up periodic monitoring
    intervalRef.current = setInterval(() => {
      checkMemoryUsage();
    }, sampleInterval);

    // Monitor component lifecycle (only in development)
    logger.component.mount(componentName);

    return () => {
      // Final memory check on unmount
      const finalStats = checkMemoryUsage();
      const lifespan = Date.now() - mountTimeRef.current;
      
      logger.component.unmount(componentName, {
        lifespan: `${lifespan}ms`,
        finalMemory: finalStats ? `${finalStats.currentUsage.toFixed(2)}MB` : 'unknown'
      });
      
      // Cleanup interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      // Warn about long-lived components
      if (lifespan > 300000) { // 5 minutes
        logger.warn(`Long-lived component: ${componentName}`, { lifespan });
      }
    };
  }, [componentName, sampleInterval, getMemoryStats, checkMemoryUsage]);

  return {
    getMemoryStats,
    checkMemoryUsage,
    forceGarbageCollection
  };
};

// Hook for monitoring global memory usage - disabled in production
export const useGlobalMemoryMonitor = () => {
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Only monitor in development
    if (process.env.NODE_ENV !== 'development') {
      return;
    }
    // Monitor global memory every 30 seconds
    intervalRef.current = setInterval(() => {
      if (typeof window !== 'undefined' && 'performance' in window) {
        const memory = (performance as any).memory;
        if (memory) {
          const stats = {
            used: (memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
            total: (memory.totalJSHeapSize / (1024 * 1024)).toFixed(2),
            limit: (memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2)
          };
          
          // performanceMonitor.recordMetric('global-memory', memory.usedJSHeapSize);
          
          // Log to performance monitor
          logger.performance.mark('Global memory usage', stats);
          
          // Warn if using more than 80% of available memory
          const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
          if (usagePercent > 80) {
            logger.warn('High global memory usage', {
              usage: `${usagePercent.toFixed(1)}%`,
              ...stats
            });
          }
        }
      }
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
};