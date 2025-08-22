import { useState, useCallback, useRef, useEffect } from 'react';
import { usePerformanceOptimization } from './usePerformanceOptimization';
import { logger } from '@/utils/logger';

interface AsyncOperationConfig {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  enableCaching?: boolean;
  cacheKey?: string;
  cacheTTL?: number; // Time to live in milliseconds
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Simple in-memory cache for async operations
const asyncCache = new Map<string, CacheEntry<any>>();

export const useOptimizedAsync = <T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  config: AsyncOperationConfig = {}
) => {
  const {
    retries = 2,
    retryDelay = 1000,
    timeout = 30000,
    enableCaching = false,
    cacheKey,
    cacheTTL = 300000 // 5 minutes default
  } = config;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const { createOptimizedCallback } = usePerformanceOptimization({
    componentName: 'useOptimizedAsync'
  });

  // Check cache
  const getCachedData = useCallback((key: string): T | null => {
    if (!enableCaching || !key) return null;
    
    const cached = asyncCache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      asyncCache.delete(key);
      return null;
    }
    
    return cached.data;
  }, [enableCaching]);

  // Set cache
  const setCachedData = useCallback((key: string, data: T) => {
    if (!enableCaching || !key) return;
    
    asyncCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: cacheTTL
    });
  }, [enableCaching, cacheTTL]);

  // Execute with retries and timeout
  const executeWithRetries = useCallback(async (
    fn: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), timeout);
      });

      const result = await Promise.race([fn(), timeoutPromise]);
      return result;
    } catch (err) {
      if (attempt < retries) {
        logger.warn(`Async operation failed, retrying (${attempt + 1}/${retries})`, err);
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        return executeWithRetries(fn, attempt + 1);
      }
      throw err;
    }
  }, [retries, retryDelay, timeout]);

  const execute = createOptimizedCallback(async (...args: Args): Promise<T | null> => {
    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Check cache first
    const key = cacheKey || JSON.stringify(args);
    const cachedResult = getCachedData(key);
    if (cachedResult !== null) {
      logger.debug('Returning cached result', { key });
      setData(cachedResult);
      return cachedResult;
    }

    setLoading(true);
    setError(null);
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await executeWithRetries(async () => {
        if (controller.signal.aborted) {
          throw new Error('Operation aborted');
        }
        return await asyncFn(...args);
      });

      if (!controller.signal.aborted) {
        setData(result);
        setCachedData(key, result);
        return result;
      }
      return null;
    } catch (err) {
      if (!controller.signal.aborted) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        logger.error('Async operation failed', error);
      }
      return null;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
      abortControllerRef.current = null;
    }
  }, [asyncFn, getCachedData, setCachedData, executeWithRetries]);

  // Cancel operation
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
    }
  }, []);

  // Reset state
  const reset = useCallback(() => {
    cancel();
    setData(null);
    setError(null);
  }, [cancel]);

  // Clear cache for this operation
  const clearCache = useCallback(() => {
    if (cacheKey) {
      asyncCache.delete(cacheKey);
    }
  }, [cacheKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    data,
    loading,
    error,
    execute,
    cancel,
    reset,
    clearCache,
    isStale: data !== null && error === null && !loading
  };
};

// Utility for batch operations
export const useBatchedAsync = <T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  batchSize: number = 3,
  batchDelay: number = 100
) => {
  const [queue, setQueue] = useState<{ args: Args; resolve: (value: T) => void; reject: (error: Error) => void }[]>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queue.length === 0) return;
    
    processingRef.current = true;
    const batch = queue.splice(0, batchSize);
    
    try {
      const results = await Promise.allSettled(
        batch.map(({ args }) => asyncFn(...args))
      );
      
      results.forEach((result, index) => {
        const { resolve, reject } = batch[index];
        if (result.status === 'fulfilled') {
          resolve(result.value);
        } else {
          reject(result.reason);
        }
      });
    } catch (err) {
      batch.forEach(({ reject }) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    } finally {
      processingRef.current = false;
      
      // Process remaining queue after delay
      if (queue.length > 0) {
        setTimeout(processQueue, batchDelay);
      }
    }
  }, [asyncFn, batchSize, queue, batchDelay]);

  const execute = useCallback((...args: Args): Promise<T> => {
    return new Promise((resolve, reject) => {
      setQueue(prev => [...prev, { args, resolve, reject }]);
      
      // Start processing after a small delay to allow batching
      setTimeout(processQueue, batchDelay);
    });
  }, [processQueue, batchDelay]);

  return { execute };
};