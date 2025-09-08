// Lightweight async hook without heavy caching and monitoring
import { useState, useCallback, useRef, useEffect } from 'react';
import { productionLogger } from '@/utils/productionLogger';

interface AsyncOperationConfig {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

export const useOptimizedAsync = <T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  config: AsyncOperationConfig = {}
) => {
  const {
    retries = 1, // Reduced retries for production
    retryDelay = 1000,
    timeout = 15000, // Reduced timeout
  } = config;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

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
        productionLogger.warn(`Async operation failed, retrying (${attempt + 1}/${retries})`, err);
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        return executeWithRetries(fn, attempt + 1);
      }
      throw err;
    }
  }, [retries, retryDelay, timeout]);

  const execute = useCallback(async (...args: Args): Promise<T | null> => {
    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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
        return result;
      }
      return null;
    } catch (err) {
      if (!controller.signal.aborted) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        productionLogger.error('Async operation failed', error);
      }
      return null;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
      abortControllerRef.current = null;
    }
  }, [asyncFn, executeWithRetries]);

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
    reset
  };
};