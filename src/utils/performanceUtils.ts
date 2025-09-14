// Performance optimization utilities - v2
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
