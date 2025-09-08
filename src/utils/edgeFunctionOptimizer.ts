// Edge function performance optimization utilities
import { logger } from './logger';

/**
 * Production-safe logging for edge functions
 * Removes console.log statements and implements structured logging
 */

interface LogContext {
  function?: string;
  operation?: string;
  duration?: number;
  [key: string]: any;
}

export class EdgeLogger {
  private static isProduction = typeof globalThis !== 'undefined' && 
    ((globalThis as any).Deno?.env.get('DENO_DEPLOYMENT_ID') || (globalThis as any).Deno?.env.get('ENVIRONMENT') === 'production');

  /**
   * Log info level messages - only in development
   */
  static info(message: string, context?: LogContext) {
    if (!this.isProduction) {
      console.log(`[INFO] ${message}`, context ? JSON.stringify(context) : '');
    }
    // In production, use structured logging service if available
    if (this.isProduction && context?.function) {
      // Could integrate with external logging service here
    }
  }

  /**
   * Log error level messages - always logged
   */
  static error(message: string, error?: any, context?: LogContext) {
    const errorInfo = {
      message,
      error: error?.message || error,
      stack: error?.stack,
      ...context,
      timestamp: new Date().toISOString()
    };
    
    if (this.isProduction) {
      // In production, send to error reporting service
      console.error(JSON.stringify(errorInfo));
    } else {
      console.error(`[ERROR] ${message}`, errorInfo);
    }
  }

  /**
   * Log performance metrics
   */
  static perf(operation: string, duration: number, context?: LogContext) {
    if (!this.isProduction) {
      console.log(`[PERF] ${operation}: ${duration}ms`, context);
    }
    // In production, could send to analytics service
  }

  /**
   * Debug logging - development only
   */
  static debug(message: string, context?: LogContext) {
    if (!this.isProduction) {
      console.log(`[DEBUG] ${message}`, context);
    }
  }
}

/**
 * Request timeout wrapper for edge functions
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 55000, // Supabase edge function timeout is 60s
  operation: string = 'operation'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  operation: string = 'operation'
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        EdgeLogger.error(`${operation} failed after ${maxRetries + 1} attempts`, lastError);
        throw lastError;
      }
      
      const delay = baseDelayMs * Math.pow(2, attempt);
      EdgeLogger.debug(`${operation} attempt ${attempt + 1} failed, retrying in ${delay}ms`, { error: lastError.message });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Rate limiter for edge functions
 */
export class RateLimiter {
  private static requests = new Map<string, { count: number; resetTime: number }>();

  static isAllowed(key: string, limit: number = 100, windowMs: number = 60000): boolean {
    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (record.count >= limit) {
      return false;
    }

    record.count++;
    return true;
  }

  static getRemainingRequests(key: string, limit: number = 100): number {
    const record = this.requests.get(key);
    if (!record || Date.now() > record.resetTime) {
      return limit;
    }
    return Math.max(0, limit - record.count);
  }
}

/**
 * Memory usage monitoring for edge functions
 */
export class MemoryMonitor {
  private static measurements: number[] = [];

  static measure(operation: string): () => void {
    const startMemory = this.getCurrentMemory();
    const startTime = Date.now();

    return () => {
      const endMemory = this.getCurrentMemory();
      const duration = Date.now() - startTime;
      const memoryDiff = endMemory - startMemory;

      this.measurements.push(memoryDiff);

      if (memoryDiff > 10 * 1024 * 1024) { // 10MB
        EdgeLogger.error(`High memory usage detected`, null, {
          operation,
          memoryIncrease: `${Math.round(memoryDiff / 1024 / 1024)}MB`,
          duration
        });
      }

      // Keep only last 10 measurements
      if (this.measurements.length > 10) {
        this.measurements.shift();
      }
    };
  }

  private static getCurrentMemory(): number {
    try {
      // Deno runtime memory usage - only available in edge functions
      const deno = (globalThis as any).Deno;
      if (typeof deno !== 'undefined' && deno.memoryUsage) {
        return deno.memoryUsage().heapUsed;
      }
    } catch {
      // Fallback - estimate based on timestamp
      return Date.now();
    }
    return 0;
  }

  static getAverageIncrease(): number {
    if (this.measurements.length === 0) return 0;
    return this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length;
  }
}
