// Progressive fallback system for handling timeouts and errors gracefully
import { useState, useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';

interface FallbackConfig {
  maxRetries: number;
  timeoutMs: number;
  retryDelayMs: number;
  fallbackValue?: any;
}

interface FallbackState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  attempt: number;
  fallbackUsed: boolean;
}

export const useProgressiveFallback = <T,>(
  config: FallbackConfig = {
    maxRetries: 2,
    timeoutMs: 10000,
    retryDelayMs: 1000
  }
) => {
  const [state, setState] = useState<FallbackState<T>>({
    data: null,
    loading: false,
    error: null,
    attempt: 0,
    fallbackUsed: false
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const executeWithFallback = useCallback(async (
    primaryOperation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T | null> => {
    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const startTime = Date.now();

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      attempt: 0,
      fallbackUsed: false
    }));

    // Progressive retry with exponential backoff
    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      try {
        setState(prev => ({ ...prev, attempt }));
        logger.debug(`${operationName} attempt ${attempt}/${config.maxRetries + 1}`);

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`${operationName} timed out after ${config.timeoutMs}ms`));
          }, config.timeoutMs);
        });

        // Race between operation and timeout
        const result = await Promise.race([
          primaryOperation(),
          timeoutPromise
        ]);

        const duration = Date.now() - startTime;
        logger.debug(`${operationName} succeeded on attempt ${attempt} (${duration}ms)`);

        setState(prev => ({
          ...prev,
          data: result,
          loading: false,
          error: null
        }));

        // Log success metrics
        logger.info(`${operationName} succeeded on attempt ${attempt}`, {
          attempt,
          duration,
          fallbackUsed: false
        });

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;
        logger.warn(`${operationName} attempt ${attempt} failed after ${duration}ms`, error);

        // If this is the last attempt, try fallback
        if (attempt === config.maxRetries + 1) {
          if (fallbackOperation) {
            logger.debug(`${operationName} trying fallback operation`);
            try {
              const fallbackResult = await fallbackOperation();
              const fallbackDuration = Date.now() - startTime;
              
              logger.debug(`${operationName} fallback succeeded (${fallbackDuration}ms)`);
              
              setState(prev => ({
                ...prev,
                data: fallbackResult,
                loading: false,
                error: null,
                fallbackUsed: true
              }));

              // Log fallback success
              logger.info(`${operationName} fallback succeeded`, {
                totalAttempts: attempt,
                fallbackDuration,
                primaryError: error instanceof Error ? error.message : String(error)
              });

              return fallbackResult;
            } catch (fallbackError) {
              logger.error(`${operationName} fallback failed`, fallbackError);
              
              // Use configured fallback value if available
              if (config.fallbackValue !== undefined) {
                logger.debug(`${operationName} using configured fallback value`);
                
                setState(prev => ({
                  ...prev,
                  data: config.fallbackValue,
                  loading: false,
                  error: null,
                  fallbackUsed: true
                }));

                return config.fallbackValue;
              }
            }
          } else if (config.fallbackValue !== undefined) {
            logger.debug(`${operationName} using configured fallback value (no fallback operation)`);
            
            setState(prev => ({
              ...prev,
              data: config.fallbackValue,
              loading: false,
              error: null,
              fallbackUsed: true
            }));

            return config.fallbackValue;
          }

          // All fallback options exhausted
          const finalError = error instanceof Error ? error : new Error(String(error));
          
          setState(prev => ({
            ...prev,
            data: null,
            loading: false,
            error: finalError
          }));

          // Log final failure
          logger.error(`${operationName}_complete_failure`, finalError);

          throw finalError;
        }

        // Wait before retry with exponential backoff
        if (attempt < config.maxRetries + 1) {
          const delay = config.retryDelayMs * Math.pow(2, attempt - 1);
          logger.debug(`${operationName} waiting ${delay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return null;
  }, [config]);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setState({
      data: null,
      loading: false,
      error: null,
      attempt: 0,
      fallbackUsed: false
    });
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setState(prev => ({
      ...prev,
      loading: false
    }));
  }, []);

  return {
    ...state,
    executeWithFallback,
    reset,
    cancel
  };
};