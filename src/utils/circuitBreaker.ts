/**
 * Enhanced Circuit Breaker Pattern Implementation with Database Persistence
 */
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  maxHalfOpenRequests: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN'
}

interface PersistedState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: Date | null;
  successCount: number;
}

export class EnhancedCircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private halfOpenRequests = 0;
  private isInitialized = false;
  
  constructor(
    private id: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureInitialized();
    
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.halfOpenRequests = 0;
        await this.persistState();
      } else {
        throw new Error(`Circuit breaker ${this.id} is OPEN - operation rejected`);
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequests >= this.config.maxHalfOpenRequests) {
        throw new Error(`Circuit breaker ${this.id} HALF_OPEN limit reached`);
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await operation();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  private async onSuccess(): Promise<void> {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = CircuitState.CLOSED;
        this.halfOpenRequests = 0;
        logger.info(`Circuit breaker ${this.id} recovered to CLOSED state`);
      }
    }
    
    await this.persistState();
  }

  private async onFailure(): Promise<void> {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN || 
        this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.halfOpenRequests = 0;
      logger.warn(`Circuit breaker ${this.id} opened due to failures`, {
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold
      });
    }
    
    await this.persistState();
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      const { data } = await supabase
        .from('circuit_breaker_state')
        .select('*')
        .eq('id', this.id)
        .single();
      
      if (data) {
        this.state = data.state as CircuitState;
        this.failureCount = data.failure_count;
        this.successCount = data.success_count;
        this.lastFailureTime = data.last_failure_at 
          ? new Date(data.last_failure_at).getTime() 
          : 0;
      }
    } catch (error) {
      logger.debug(`No persisted state found for circuit breaker ${this.id}`);
    }
    
    this.isInitialized = true;
  }

  private async persistState(): Promise<void> {
    try {
      await supabase
        .from('circuit_breaker_state')
        .upsert({
          id: this.id,
          state: this.state,
          failure_count: this.failureCount,
          success_count: this.successCount,
          last_failure_at: this.lastFailureTime 
            ? new Date(this.lastFailureTime).toISOString() 
            : null,
          updated_at: new Date().toISOString()
        });
    } catch (error) {
      logger.error(`Failed to persist circuit breaker state for ${this.id}`, error as Error);
    }
  }

  public getState(): CircuitState {
    return this.state;
  }

  public async getMetrics() {
    await this.ensureInitialized();
    return {
      id: this.id,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenRequests: this.halfOpenRequests,
      isHealthy: this.state === CircuitState.CLOSED
    };
  }

  public async reset(): Promise<void> {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenRequests = 0;
    await this.persistState();
    logger.info(`Circuit breaker ${this.id} manually reset`);
  }
}

// Enhanced circuit breakers for different operations
export const messageProcessingCircuitBreaker = new EnhancedCircuitBreaker(
  'message_processing', 
  {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    monitoringPeriod: 10000,
    maxHalfOpenRequests: 3
  }
);

export const aiServiceCircuitBreaker = new EnhancedCircuitBreaker(
  'ai_service',
  {
    failureThreshold: 3,
    recoveryTimeout: 60000,
    monitoringPeriod: 15000,
    maxHalfOpenRequests: 1
  }
);

export const databaseCircuitBreaker = new EnhancedCircuitBreaker(
  'database_operations',
  {
    failureThreshold: 10,
    recoveryTimeout: 15000,
    monitoringPeriod: 5000,
    maxHalfOpenRequests: 5
  }
);

// Legacy support
export class CircuitBreaker extends EnhancedCircuitBreaker {
  constructor(config: CircuitBreakerConfig) {
    super('legacy_breaker', { ...config, maxHalfOpenRequests: 3 });
  }
}