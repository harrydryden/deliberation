/**
 * Enhanced Error Recovery Service - Production Ready
 * Comprehensive error handling with sophisticated fallback strategies
 */
import { logger } from '@/utils/logger';
import { enhancedErrorReporting } from '@/utils/enhancedErrorReporting';
import { aiServiceCircuitBreaker, databaseCircuitBreaker } from '@/utils/circuitBreaker';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: Error, attempt: number) => boolean;
}

interface FallbackStrategy<T> {
  name: string;
  execute: () => Promise<T> | T;
  condition?: (error: Error) => boolean;
  priority: number;
}

interface ErrorRecoveryContext {
  operation: string;
  startTime: number;
  attempts: number;
  errors: Error[];
  fallbacksUsed: string[];
  metadata?: Record<string, any>;
}

interface BulkheadConfig {
  maxConcurrent: number;
  queueSize: number;
  timeout: number;
}

class EnhancedErrorRecoveryService {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error: Error) => this.isRetryableError(error)
  };

  // Bulkhead pattern for resource isolation
  private static bulkheads = new Map<string, {
    config: BulkheadConfig;
    running: number;
    queue: Array<{ resolve: Function; reject: Function; operation: Function }>;
  }>();

  /**
   * Enhanced retry with exponential backoff, jitter, and conditions
   */
  static async withEnhancedRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context: string = 'unknown'
  ): Promise<T> {
    const fullConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
    const recoveryContext: ErrorRecoveryContext = {
      operation: context,
      startTime: Date.now(),
      attempts: 0,
      errors: [],
      fallbacksUsed: []
    };

    let lastError: Error;

    for (let attempt = 1; attempt <= fullConfig.maxRetries + 1; attempt++) {
      recoveryContext.attempts = attempt;

      try {
        const result = await operation();
        
        if (attempt > 1) {
          logger.info('Operation recovered after retry', {
            context,
            attempt,
            totalDuration: Date.now() - recoveryContext.startTime,
            errorsEncountered: recoveryContext.errors.length
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        recoveryContext.errors.push(lastError);

        // Check if we should retry this error
        if (fullConfig.retryCondition && !fullConfig.retryCondition(lastError, attempt)) {
          logger.warn('Error not retryable, failing fast', {
            context,
            error: lastError.message,
            attempt
          });
          break;
        }

        logger.warn('Operation failed, will retry', {
          context,
          attempt,
          maxAttempts: fullConfig.maxRetries + 1,
          error: lastError.message,
          errorType: lastError.constructor.name
        });

        // Don't wait after the last attempt
        if (attempt <= fullConfig.maxRetries) {
          const delay = this.calculateDelayWithJitter(attempt, fullConfig);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    this.reportFailure(recoveryContext, lastError);
    throw lastError;
  }

  /**
   * Multi-layered fallback system
   */
  static async withFallbackStrategies<T>(
    primaryOperation: () => Promise<T>,
    fallbackStrategies: FallbackStrategy<T>[],
    context: string = 'fallback_operation'
  ): Promise<T> {
    const recoveryContext: ErrorRecoveryContext = {
      operation: context,
      startTime: Date.now(),
      attempts: 1,
      errors: [],
      fallbacksUsed: []
    };

    // Sort fallbacks by priority
    const sortedFallbacks = [...fallbackStrategies].sort((a, b) => a.priority - b.priority);

    try {
      return await primaryOperation();
    } catch (primaryError) {
      recoveryContext.errors.push(primaryError as Error);
      
      logger.warn(`Primary operation failed, trying ${sortedFallbacks.length} fallback strategies`, {
        context,
        error: (primaryError as Error).message
      });

      // Try each fallback strategy
      for (const strategy of sortedFallbacks) {
        // Check if this strategy should be used for this error
        if (strategy.condition && !strategy.condition(primaryError as Error)) {
          continue;
        }

        try {
          recoveryContext.fallbacksUsed.push(strategy.name);
          const result = await strategy.execute();
          
          logger.info(`Fallback strategy succeeded: ${strategy.name}`, {
            context,
            fallbacksAttempted: recoveryContext.fallbacksUsed.length,
            totalDuration: Date.now() - recoveryContext.startTime
          });
          
          return result;
        } catch (fallbackError) {
          recoveryContext.errors.push(fallbackError as Error);
          logger.warn(`Fallback strategy failed: ${strategy.name}`, {
            context,
            error: (fallbackError as Error).message
          });
        }
      }

      // All fallbacks failed
      this.reportFailure(recoveryContext, recoveryContext.errors[recoveryContext.errors.length - 1]);
      throw new Error(`All recovery strategies failed for ${context}. Last error: ${recoveryContext.errors[recoveryContext.errors.length - 1].message}`);
    }
  }

  /**
   * Bulkhead pattern for resource isolation
   */
  static async withBulkhead<T>(
    operation: () => Promise<T>,
    bulkheadName: string,
    config: BulkheadConfig,
    context: string = 'bulkhead_operation'
  ): Promise<T> {
    if (!this.bulkheads.has(bulkheadName)) {
      this.bulkheads.set(bulkheadName, {
        config,
        running: 0,
        queue: []
      });
    }

    const bulkhead = this.bulkheads.get(bulkheadName)!;

    return new Promise<T>((resolve, reject) => {
      const executeOperation = async () => {
        if (bulkhead.running >= bulkhead.config.maxConcurrent) {
          // Add to queue if there's space
          if (bulkhead.queue.length < bulkhead.config.queueSize) {
            bulkhead.queue.push({ resolve, reject, operation });
            return;
          } else {
            reject(new Error(`Bulkhead ${bulkheadName} queue is full`));
            return;
          }
        }

        bulkhead.running++;
        
        try {
          const timeoutPromise = new Promise<never>((_, timeoutReject) =>
            setTimeout(() => timeoutReject(new Error(`Bulkhead operation timeout: ${bulkheadName}`)), bulkhead.config.timeout)
          );

          const result = await Promise.race([operation(), timeoutPromise]);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          bulkhead.running--;
          
          // Process next item in queue
          const next = bulkhead.queue.shift();
          if (next) {
            setImmediate(() => executeOperation());
          }
        }
      };

      executeOperation();
    });
  }

  /**
   * AI service specific error recovery
   */
  static async withAIServiceResilience<T>(
    operation: () => Promise<T>,
    fallbackValue?: T,
    context: string = 'ai_service'
  ): Promise<T> {
    const fallbackStrategies: FallbackStrategy<T>[] = [];
    
    if (fallbackValue !== undefined) {
      fallbackStrategies.push({
        name: 'default_value',
        execute: () => fallbackValue,
        priority: 100
      });
    }

    // Add degraded mode fallback
    fallbackStrategies.push({
      name: 'degraded_mode',
      execute: () => {
        logger.warn(`AI service degraded mode activated for ${context}`);
        return fallbackValue || ({} as T);
      },
      condition: (error) => error.message.includes('rate limit') || error.message.includes('quota'),
      priority: 50
    });

    return this.withFallbackStrategies(
      () => aiServiceCircuitBreaker.execute(() => 
        this.withEnhancedRetry(operation, {
          maxRetries: 2,
          baseDelay: 3000,
          maxDelay: 15000,
          retryCondition: (error, attempt) => 
            attempt <= 2 && (
              error.message.includes('network') ||
              error.message.includes('timeout') ||
              error.message.includes('503')
            )
        }, context)
      ),
      fallbackStrategies,
      context
    );
  }

  /**
   * Database operation error recovery
   */
  static async withDatabaseResilience<T>(
    operation: () => Promise<T>,
    context: string = 'database_operation'
  ): Promise<T> {
    return databaseCircuitBreaker.execute(() =>
      this.withEnhancedRetry(
        operation,
        {
          maxRetries: 3,
          baseDelay: 500,
          maxDelay: 5000,
          retryCondition: (error) => 
            error.message.includes('connection') ||
            error.message.includes('timeout') ||
            error.message.includes('503') ||
            error.message.includes('502')
        },
        context
      )
    );
  }

  /**
   * Network request error recovery with adaptive timeouts
   */
  static async withNetworkResilience<T>(
    operation: () => Promise<T>,
    context: string = 'network_operation'
  ): Promise<T> {
    const networkStrategies: FallbackStrategy<T>[] = [
      {
        name: 'retry_with_exponential_backoff',
        execute: () => this.withEnhancedRetry(
          operation,
          {
            maxRetries: 4,
            baseDelay: 1000,
            maxDelay: 16000,
            backoffMultiplier: 2,
            jitter: true
          },
          context
        ),
        condition: (error) => this.isNetworkError(error),
        priority: 1
      }
    ];

    return this.withFallbackStrategies(operation, networkStrategies, context);
  }

  /**
   * Comprehensive error recovery for critical operations
   */
  static async withComprehensiveRecovery<T>(
    operation: () => Promise<T>,
    options: {
      fallbackValue?: T;
      retryConfig?: Partial<RetryConfig>;
      bulkhead?: { name: string; config: BulkheadConfig };
      context?: string;
    } = {}
  ): Promise<T> {
    const {
      fallbackValue,
      retryConfig = {},
      bulkhead,
      context = 'comprehensive_recovery'
    } = options;

    const wrappedOperation = bulkhead
      ? () => this.withBulkhead(operation, bulkhead.name, bulkhead.config, context)
      : operation;

    const fallbackStrategies: FallbackStrategy<T>[] = [];

    if (fallbackValue !== undefined) {
      fallbackStrategies.push({
        name: 'safe_fallback_value',
        execute: () => fallbackValue,
        priority: 100
      });
    }

    return this.withFallbackStrategies(
      () => this.withEnhancedRetry(wrappedOperation, retryConfig, context),
      fallbackStrategies,
      context
    );
  }

  // Helper methods
  private static calculateDelayWithJitter(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const clampedDelay = Math.min(exponentialDelay, config.maxDelay);
    
    if (config.jitter) {
      // Add ±25% jitter to prevent thundering herd
      const jitterRange = clampedDelay * 0.25;
      const jitter = (Math.random() * 2 - 1) * jitterRange;
      return Math.max(0, clampedDelay + jitter);
    }
    
    return clampedDelay;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      'network error',
      'timeout',
      'connection reset',
      '503',
      '502',
      '504',
      'rate limit',
      'temporary failure'
    ];

    return retryablePatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private static isNetworkError(error: Error): boolean {
    const networkPatterns = [
      'network',
      'fetch',
      'connection',
      'timeout',
      'dns',
      'certificate',
      'ssl',
      'tls'
    ];

    return networkPatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private static reportFailure(context: ErrorRecoveryContext, finalError: Error): void {
    const duration = Date.now() - context.startTime;
    
    logger.error('Error recovery exhausted all strategies', {
      operation: context.operation,
      duration,
      attempts: context.attempts,
      errors: context.errors.map(e => ({ message: e.message, type: e.constructor.name })),
      fallbacksUsed: context.fallbacksUsed,
      finalError: finalError.message
    });

    enhancedErrorReporting.captureException(finalError, {
      component: 'ErrorRecovery',
      metadata: {
        errorRecovery: context,
        recoveryExhausted: true,
        duration
      }
    });
  }
}

export { EnhancedErrorRecoveryService };