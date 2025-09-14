/**
 * Centralized Error Recovery Service
 * Handles AI service failures, network issues, and provides graceful fallbacks
 */

import { logger } from '@/utils/logger';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface ErrorContext {
  operation: string;
  attempt: number;
  maxAttempts: number;
  error: Error;
  timestamp: Date;
}

export class ErrorRecoveryService {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  };

  /**
   * Execute operation with exponential backoff retry
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context: string = 'unknown'
  ): Promise<T> {
    const fullConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error;

    for (let attempt = 1; attempt <= fullConfig.maxRetries + 1; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', { 
            context, 
            attempt, 
            totalAttempts: fullConfig.maxRetries + 1 
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        logger.warn('Operation failed, will retry', {
          context,
          attempt,
          maxAttempts: fullConfig.maxRetries + 1,
          error: lastError.message,
          nextRetryIn: this.calculateDelay(attempt, fullConfig)
        });

        // Don't wait after the last attempt
        if (attempt <= fullConfig.maxRetries) {
          const delay = this.calculateDelay(attempt, fullConfig);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    logger.error('All retry attempts exhausted', {
      context,
      totalAttempts: fullConfig.maxRetries + 1,
      finalError: lastError.message
    });

    throw lastError;
  }

  /**
   * Execute operation with circuit breaker pattern
   */
  static async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    context: string = 'unknown',
    failureThreshold: number = 5,
    resetTimeout: number = 60000
  ): Promise<T> {
    // Simple in-memory circuit breaker state
    const circuitKey = `circuit_${context}`;
    const state = this.getCircuitState(circuitKey);
    
    if (state.isOpen && Date.now() - state.lastFailure < resetTimeout) {
      throw new Error(`Circuit breaker is OPEN for ${context}. Try again later.`);
    }

    try {
      const result = await operation();
      
      // Reset circuit on success
      this.resetCircuit(circuitKey);
      return result;
    } catch (error) {
      this.recordFailure(circuitKey, failureThreshold);
      throw error;
    }
  }

  /**
   * Provide fallback for OpenAI API failures
   */
  static async withOpenAIFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackValue: T,
    context: string = 'openai_operation'
  ): Promise<T> {
    try {
      return await this.withRetry(primaryOperation, {
        maxRetries: 2,
        baseDelay: 2000,
      }, context);
    } catch (error) {
      logger.warn('OpenAI operation failed, using fallback', {
        context,
        error: error.message,
        fallbackUsed: true
      });
      return fallbackValue;
    }
  }

  /**
   * Handle network-related errors with appropriate retry logic
   */
  static async withNetworkResilience<T>(
    operation: () => Promise<T>,
    context: string = 'network_operation'
  ): Promise<T> {
    return this.withRetry(
      operation,
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 8000,
        backoffMultiplier: 2,
      },
      context
    );
  }

  /**
   * Calculate delay for exponential backoff
   */
  private static calculateDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(delay, config.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Simple in-memory circuit breaker state management
  private static circuitStates = new Map<string, {
    failureCount: number;
    lastFailure: number;
    isOpen: boolean;
  }>();

  private static getCircuitState(key: string) {
    if (!this.circuitStates.has(key)) {
      this.circuitStates.set(key, {
        failureCount: 0,
        lastFailure: 0,
        isOpen: false,
      });
    }
    return this.circuitStates.get(key)!;
  }

  private static recordFailure(key: string, threshold: number) {
    const state = this.getCircuitState(key);
    state.failureCount++;
    state.lastFailure = Date.now();
    
    if (state.failureCount >= threshold) {
      state.isOpen = true;
      logger.warn('Circuit breaker opened', { key, failureCount: state.failureCount });
    }
  }

  private static resetCircuit(key: string) {
    const state = this.getCircuitState(key);
    state.failureCount = 0;
    state.isOpen = false;
  }
}