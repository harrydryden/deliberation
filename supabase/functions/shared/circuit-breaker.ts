// Circuit breaker pattern for external API calls
import { EdgeLogger } from './edge-logger.ts';

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitMetrics {
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private metrics: CircuitMetrics = {
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0
  };

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        EdgeLogger.info(`Circuit breaker ${this.name} moving to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN - operation rejected`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.metrics.lastFailureTime > this.config.recoveryTimeout;
  }

  private onSuccess(): void {
    this.metrics.successes++;
    this.metrics.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.metrics.failures = 0; // Reset failure count
      EdgeLogger.info(`Circuit breaker ${this.name} reset to CLOSED`);
    }
  }

  private onFailure(): void {
    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();

    if (this.metrics.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      EdgeLogger.error(`Circuit breaker ${this.name} tripped to OPEN`, {
        failures: this.metrics.failures,
        threshold: this.config.failureThreshold
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitMetrics & { state: CircuitState } {
    return { ...this.metrics, state: this.state };
  }
}

// Pre-configured circuit breakers for common services
export const openAICircuitBreaker = new CircuitBreaker('OpenAI', {
  failureThreshold: 3,
  recoveryTimeout: 30000, // 30 seconds
  monitoringPeriod: 60000  // 1 minute
});

export const supabaseCircuitBreaker = new CircuitBreaker('Supabase', {
  failureThreshold: 5,
  recoveryTimeout: 15000, // 15 seconds  
  monitoringPeriod: 60000  // 1 minute
});