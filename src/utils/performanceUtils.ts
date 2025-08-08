// Performance optimization utilities
import { useCallback, useMemo, useRef, useEffect } from 'react';
import { logger } from './logger';

// Debounce hook with cleanup
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  
  const debouncedCallback = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]) as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

// Throttle hook
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef<number>(0);
  
  const throttledCallback = useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCallRef.current >= delay) {
      lastCallRef.current = now;
      callback(...args);
    }
  }, [callback, delay]) as T;

  return throttledCallback;
}

// Memoization with size limit
export function createMemoCache<T>(maxSize: number = 100) {
  const cache = new Map<string, T>();
  
  return {
    get: (key: string): T | undefined => cache.get(key),
    set: (key: string, value: T): void => {
      if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set(key, value);
    },
    has: (key: string): boolean => cache.has(key),
    clear: (): void => cache.clear(),
    size: () => cache.size
  };
}

// Performance monitoring
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTimer(operation: string): () => void {
    const start = performance.now();
    
    return () => {
      const duration = performance.now() - start;
      this.recordMetric(operation, duration);
      
      if (duration > 100) { // Log slow operations
        logger.performance.mark(`Slow operation: ${operation}`, { duration: `${duration.toFixed(2)}ms` });
      }
    };
  }

  private recordMetric(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const operationMetrics = this.metrics.get(operation)!;
    operationMetrics.push(duration);
    
    // Keep only last 100 measurements
    if (operationMetrics.length > 100) {
      operationMetrics.shift();
    }
  }

  getMetrics(operation: string): { avg: number; min: number; max: number; count: number } | null {
    const metrics = this.metrics.get(operation);
    if (!metrics || metrics.length === 0) return null;

    const sum = metrics.reduce((a, b) => a + b, 0);
    return {
      avg: sum / metrics.length,
      min: Math.min(...metrics),
      max: Math.max(...metrics),
      count: metrics.length
    };
  }

  getAllMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, any> = {};
    
    for (const [operation] of this.metrics) {
      const metrics = this.getMetrics(operation);
      if (metrics) {
        result[operation] = metrics;
      }
    }
    
    return result;
  }

  clearMetrics(): void {
    this.metrics.clear();
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

// Performance hook
export function usePerformanceTimer(operation: string) {
  return useMemo(() => {
    return performanceMonitor.startTimer(operation);
  }, [operation]);
}

// Memory leak detection
export function useMemoryLeakDetection(componentName: string) {
  const mountTimeRef = useRef<number>(Date.now());
  
  useEffect(() => {
    logger.component.mount(componentName);
    
    return () => {
      const lifespan = Date.now() - mountTimeRef.current;
      logger.component.unmount(componentName, { lifespan: `${lifespan}ms` });
      
      // Warn about long-lived components
      if (lifespan > 300000) { // 5 minutes
        logger.warn(`Long-lived component: ${componentName}`, { lifespan });
      }
    };
  }, [componentName]);
}
