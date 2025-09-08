// Production-safe edge function logger
// Optimized for Deno edge functions with minimal overhead

interface LogContext {
  [key: string]: any;
}

export class EdgeLogger {
  private static isProduction = Deno.env.get('NODE_ENV') === 'production';

  static info(message: string, context?: LogContext): void {
    if (this.isProduction) return; // Completely disabled in production
    
    console.log(`[INFO] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  static error(message: string, error?: any, context?: LogContext): void {
    // Always log errors, even in production
    const errorInfo = error ? (error instanceof Error ? error.message : String(error)) : '';
    const contextStr = context ? JSON.stringify(context, null, 2) : '';
    
    console.error(`[ERROR] ${message}`, errorInfo, contextStr);
  }

  static warn(message: string, context?: LogContext): void {
    if (this.isProduction) return; // Disabled in production
    
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  static debug(message: string, context?: LogContext): void {
    if (this.isProduction) return; // Completely disabled in production
    
    console.log(`[DEBUG] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  static perf(operation: string, duration: number, context?: LogContext): void {
    if (this.isProduction && duration < 5000) return; // Only log slow operations in production
    
    const level = duration > 5000 ? 'SLOW' : 'FAST';
    console.log(`[PERF-${level}] ${operation}: ${duration.toFixed(2)}ms`, 
      context ? JSON.stringify(context, null, 2) : '');
  }
}

// Export timeout and retry utilities for edge functions
export async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number = 45000, 
  operation: string = 'operation'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

export async function withRetry<T>(
  fn: () => Promise<T>, 
  maxRetries: number = 3, 
  baseDelayMs: number = 1000,
  operation: string = 'operation'
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        EdgeLogger.error(`${operation} failed after ${maxRetries} attempts`, error);
        throw error;
      }
      
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      EdgeLogger.debug(`${operation} attempt ${attempt} failed, retrying in ${delay}ms`, { error });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`${operation} exhausted all retries`);
}