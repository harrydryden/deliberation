/**
 * Memory Monitor Hook for Performance Tracking
 */
import { useEffect, useRef, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { enhancedErrorReporting } from '@/utils/enhancedErrorReporting';

interface MemoryStats {
  usedJSMemory: number;
  totalJSMemory: number;
  memoryUsagePercent: number;
  componentsInMemory: number;
}

interface MemoryMonitorConfig {
  threshold: number; // MB
  interval: number; // ms
  enableAutoCleanup: boolean;
}

const DEFAULT_CONFIG: MemoryMonitorConfig = {
  threshold: 150, // 150MB - increased from 70MB to match actual usage
  interval: 60000, // 60 seconds - reduced frequency to minimize overhead
  enableAutoCleanup: true,
};

export const useMemoryMonitor = (
  componentName: string,
  config: Partial<MemoryMonitorConfig> = {}
) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const lastCleanupRef = useRef<number>(0);
  const mountTimeRef = useRef<number>(Date.now());
  const cleanupCallbacks = useRef<Set<() => void>>(new Set());

  const getMemoryStats = useCallback((): MemoryStats => {
    const performance = (window as any).performance;
    const memory = performance?.memory;
    
    if (memory) {
      const usedJSMemory = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const totalJSMemory = Math.round(memory.totalJSHeapSize / 1024 / 1024);
      
      return {
        usedJSMemory,
        totalJSMemory,
        memoryUsagePercent: Math.round((usedJSMemory / totalJSMemory) * 100),
        componentsInMemory: cleanupCallbacks.current.size,
      };
    }
    
    return {
      usedJSMemory: 0,
      totalJSMemory: 0,
      memoryUsagePercent: 0,
      componentsInMemory: cleanupCallbacks.current.size,
    };
  }, []);

  const performCleanup = useCallback(() => {
    const now = Date.now();
    const timeSinceLastCleanup = now - lastCleanupRef.current;
    
    // Only cleanup if enough time has passed
    if (timeSinceLastCleanup < 10000) return; // 10 seconds minimum
    
    let cleanedCount = 0;
    
    // Execute all registered cleanup callbacks
    cleanupCallbacks.current.forEach(callback => {
      try {
        callback();
        cleanedCount++;
      } catch (error) {
        logger.error('Cleanup callback failed', { componentName, error });
      }
    });
    
    // Force garbage collection if available (dev only)
    if (typeof window !== 'undefined' && (window as any).gc) {
      try {
        (window as any).gc();
      } catch (e) {
        // Ignore - gc() not available
      }
    }
    
    lastCleanupRef.current = now;
    
    logger.info('Memory cleanup performed', {
      componentName,
      cleanedCount,
      timeSinceLastCleanup: `${timeSinceLastCleanup}ms`
    });
  }, [componentName]);

  const checkMemoryUsage = useCallback(() => {
    const stats = getMemoryStats();
    
    if (stats.usedJSMemory > finalConfig.threshold) {
      logger.warn('High memory usage detected', {
        componentName,
        ...stats,
        threshold: `${finalConfig.threshold}MB`
      });
      
      enhancedErrorReporting.reportMemoryIssue(
        stats.usedJSMemory,
        finalConfig.threshold,
        { componentName, ...stats }
      );
      
      if (finalConfig.enableAutoCleanup) {
        performCleanup();
      }
    }
    
    return stats;
  }, [componentName, finalConfig.threshold, finalConfig.enableAutoCleanup, getMemoryStats, performCleanup]);

  const registerCleanup = useCallback((callback: () => void) => {
    cleanupCallbacks.current.add(callback);
    
    return () => {
      cleanupCallbacks.current.delete(callback);
    };
  }, []);

  // Automatic monitoring
  useEffect(() => {
    const interval = setInterval(checkMemoryUsage, finalConfig.interval);
    
    return () => {
      clearInterval(interval);
    };
  }, [checkMemoryUsage, finalConfig.interval]);

  // Component lifecycle tracking
  useEffect(() => {
    logger.info('Component mounted', { 
      componentName,
      memoryStats: getMemoryStats()
    });
    
    return () => {
      const lifespan = Date.now() - mountTimeRef.current;
      
      // Perform final cleanup
      performCleanup();
      
      logger.info('Component unmounted', { 
        componentName,
        lifespan: `${lifespan}ms`,
        finalMemoryStats: getMemoryStats()
      });
    };
  }, [componentName, getMemoryStats, performCleanup]);

  return {
    getMemoryStats,
    checkMemoryUsage,
    performCleanup,
    registerCleanup,
    isHighMemoryUsage: () => getMemoryStats().usedJSMemory > finalConfig.threshold,
  };
};