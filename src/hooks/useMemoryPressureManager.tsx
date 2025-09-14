/**
 * Memory Pressure Manager Hook
 * Monitors memory usage and triggers cleanup when thresholds exceeded
 */
import { useEffect, useCallback, useRef, useState } from 'react';
import { logger } from '@/utils/logger';

interface MemoryStats {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
  usage?: number;
}

interface MemoryPressureState {
  isUnderPressure: boolean;
  memoryUsage: number;
  lastCleanup: Date | null;
  cleanupCount: number;
}

export const useMemoryPressureManager = (
  thresholdMB: number = 150,
  checkIntervalMs: number = 30000
) => {
  const [pressureState, setPressureState] = useState<MemoryPressureState>({
    isUnderPressure: false,
    memoryUsage: 0,
    lastCleanup: null,
    cleanupCount: 0
  });

  const cleanupCallbacksRef = useRef<Array<() => void>>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const getMemoryStats = useCallback((): MemoryStats => {
    // Use performance.memory if available (Chrome/Edge)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        usage: memory.usedJSHeapSize / (1024 * 1024) // Convert to MB
      };
    }
    
    // Fallback estimation
    return {
      usage: 0,
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0
    };
  }, []);

  const triggerCleanup = useCallback(() => {
    logger.info('Memory pressure detected - triggering cleanup', {
      currentUsage: pressureState.memoryUsage,
      threshold: thresholdMB,
      callbacks: cleanupCallbacksRef.current.length
    });

    // Execute all registered cleanup callbacks
    cleanupCallbacksRef.current.forEach((callback, index) => {
      try {
        callback();
      } catch (error) {
        logger.error(`Cleanup callback ${index} failed`, error as Error);
      }
    });

    setPressureState(prev => ({
      ...prev,
      lastCleanup: new Date(),
      cleanupCount: prev.cleanupCount + 1
    }));

    // Force garbage collection if available
    if ('gc' in window && typeof (window as any).gc === 'function') {
      try {
        (window as any).gc();
      } catch (e) {
        // Ignore GC errors
      }
    }
  }, [pressureState.memoryUsage, thresholdMB]);

  const checkMemoryPressure = useCallback(() => {
    const stats = getMemoryStats();
    const currentUsage = stats.usage || 0;
    const isUnderPressure = currentUsage > thresholdMB;

    setPressureState(prev => ({
      ...prev,
      isUnderPressure,
      memoryUsage: currentUsage
    }));

    if (isUnderPressure) {
      // Only trigger cleanup if we haven't done one recently (last 30 seconds)
      const timeSinceLastCleanup = pressureState.lastCleanup 
        ? Date.now() - pressureState.lastCleanup.getTime()
        : Infinity;

      if (timeSinceLastCleanup > 30000) {
        triggerCleanup();
      }
    }

    logger.debug('Memory check completed', {
      currentUsage: `${currentUsage.toFixed(1)}MB`,
      threshold: `${thresholdMB}MB`,
      isUnderPressure,
      stats
    });

    return { currentUsage, isUnderPressure, stats };
  }, [getMemoryStats, thresholdMB, pressureState.lastCleanup, triggerCleanup]);

  const registerCleanupCallback = useCallback((callback: () => void) => {
    cleanupCallbacksRef.current.push(callback);
    
    // Return cleanup function
    return () => {
      const index = cleanupCallbacksRef.current.indexOf(callback);
      if (index > -1) {
        cleanupCallbacksRef.current.splice(index, 1);
      }
    };
  }, []);

  // Start monitoring
  useEffect(() => {
    // Initial check
    checkMemoryPressure();

    // Set up interval monitoring
    intervalRef.current = setInterval(checkMemoryPressure, checkIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkMemoryPressure, checkIntervalMs]);

  const forceCleanup = useCallback(() => {
    triggerCleanup();
  }, [triggerCleanup]);

  const getMemoryInfo = useCallback(() => {
    const stats = getMemoryStats();
    return {
      ...pressureState,
      ...stats,
      threshold: thresholdMB,
      callbackCount: cleanupCallbacksRef.current.length
    };
  }, [pressureState, getMemoryStats, thresholdMB]);

  return {
    pressureState,
    registerCleanupCallback,
    forceCleanup,
    checkMemoryPressure,
    getMemoryInfo
  };
};