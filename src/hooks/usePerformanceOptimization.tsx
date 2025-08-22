import { useCallback, useMemo, useRef, useEffect } from 'react';
import { logger } from '@/utils/logger';

/**
 * Performance optimization utilities for React components and hooks
 */

interface PerformanceConfig {
  enableLogging?: boolean;
  componentName?: string;
  memoryThreshold?: number;
}

export const usePerformanceOptimization = (config: PerformanceConfig = {}) => {
  const { enableLogging = false, componentName = 'Unknown', memoryThreshold = 50 } = config;
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(Date.now());

  useEffect(() => {
    renderCountRef.current += 1;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;
    lastRenderTimeRef.current = now;

    if (enableLogging) {
      logger.debug(`${componentName} render #${renderCountRef.current}`, {
        timeSinceLastRender,
        memoryUsage: (performance as any).memory?.usedJSHeapSize || 0
      });
    }

    // Memory leak detection
    if ((performance as any).memory?.usedJSHeapSize) {
      const memoryMB = (performance as any).memory.usedJSHeapSize / 1024 / 1024;
      if (memoryMB > memoryThreshold) {
        logger.warn(`High memory usage detected in ${componentName}`, {
          memoryUsage: memoryMB,
          renderCount: renderCountRef.current
        });
      }
    }
  });

  // Optimized callback creator with dependency tracking
  const createOptimizedCallback = useCallback(
    (fn: any, deps: React.DependencyList, debugName?: string) => {
      const depsRef = useRef(deps);
      const callbackRef = useRef(fn);

      // Update callback only if dependencies changed
      const depsChanged = useMemo(() => {
        if (depsRef.current.length !== deps.length) return true;
        return deps.some((dep, index) => dep !== depsRef.current[index]);
      }, deps);

      if (depsChanged) {
        depsRef.current = deps;
        callbackRef.current = fn;
        
        if (enableLogging && debugName) {
          logger.debug(`Callback updated: ${debugName}`, { componentName });
        }
      }

      return callbackRef.current;
    },
    [enableLogging, componentName]
  );

  // Optimized memo creator with custom comparison
  const createOptimizedMemo = useCallback(
    (factory: () => any, deps: React.DependencyList, compare?: (prev: React.DependencyList, next: React.DependencyList) => boolean) => {
      const depsRef = useRef(deps);
      const valueRef = useRef<any>();
      const hasValueRef = useRef(false);

      const shouldUpdate = useMemo(() => {
        if (!hasValueRef.current) return true;
        
        if (compare) {
          return !compare(depsRef.current, deps);
        }
        
        if (depsRef.current.length !== deps.length) return true;
        return deps.some((dep, index) => dep !== depsRef.current[index]);
      }, deps);

      if (shouldUpdate) {
        depsRef.current = deps;
        valueRef.current = factory();
        hasValueRef.current = true;
      }

      return valueRef.current;
    },
    []
  );

  // Debounced function creator
  const createDebouncedCallback = useCallback(
    (fn: any, delay: number) => {
      const timeoutRef = useRef<NodeJS.Timeout>();

      return useCallback(
        (...args: any[]) => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          
          timeoutRef.current = setTimeout(() => {
            fn(...args);
          }, delay);
        },
        [fn, delay]
      );
    },
    []
  );

  // Throttled function creator
  const createThrottledCallback = useCallback(
    (fn: any, limit: number) => {
      const inThrottleRef = useRef(false);

      return useCallback(
        (...args: any[]) => {
          if (!inThrottleRef.current) {
            fn(...args);
            inThrottleRef.current = true;
            setTimeout(() => {
              inThrottleRef.current = false;
            }, limit);
          }
        },
        [fn, limit]
      );
    },
    []
  );

  // Batch state updates
  const createBatchedUpdater = useCallback(
    (setter: React.Dispatch<React.SetStateAction<any>>, batchDelay: number = 16) => {
      const pendingUpdatesRef = useRef<((prev: any) => any)[]>([]);
      const timeoutRef = useRef<NodeJS.Timeout>();

      return useCallback(
        (update: any) => {
          const updateFn = typeof update === 'function' ? update : () => update;
          pendingUpdatesRef.current.push(updateFn);

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }

          timeoutRef.current = setTimeout(() => {
            const updates = pendingUpdatesRef.current.splice(0);
            if (updates.length > 0) {
              setter(prev => updates.reduce((acc, updateFn) => updateFn(acc), prev));
            }
          }, batchDelay);
        },
        [setter, batchDelay]
      );
    },
    []
  );

  return {
    renderCount: renderCountRef.current,
    createOptimizedCallback,
    createOptimizedMemo,
    createDebouncedCallback,
    createThrottledCallback,
    createBatchedUpdater,
  };
};

/**
 * Hook for monitoring component performance metrics
 */
export const useComponentMetrics = (componentName: string) => {
  const renderTimeRef = useRef<number[]>([]);
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    const startTime = Date.now();
    
    return () => {
      const renderTime = Date.now() - startTime;
      renderTimeRef.current.push(renderTime);
      
      // Keep only last 10 render times
      if (renderTimeRef.current.length > 10) {
        renderTimeRef.current = renderTimeRef.current.slice(-10);
      }
    };
  });

  const getMetrics = useCallback(() => {
    const renderTimes = renderTimeRef.current;
    const avgRenderTime = renderTimes.length > 0 
      ? renderTimes.reduce((sum, time) => sum + time, 0) / renderTimes.length 
      : 0;
    
    return {
      componentName,
      averageRenderTime: avgRenderTime,
      totalRenders: renderTimes.length,
      mountTime: mountTimeRef.current,
      lastRenderTime: renderTimes[renderTimes.length - 1] || 0,
    };
  }, [componentName]);

  return { getMetrics };
};
