// Structured error classes for better error handling and debugging
export interface ErrorContext {
  operation?: string;
  component?: string;
  userId?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export class StructuredError extends Error {
  public readonly correlationId: string;
  public readonly timestamp: number;
  public readonly context: ErrorContext;
  public readonly errorType: string;

  constructor(message: string, context: ErrorContext = {}, errorType: string = 'StructuredError') {
    super(message);
    this.name = errorType;
    this.errorType = errorType;
    this.correlationId = context.correlationId || `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = Date.now();
    this.context = context;
    
    // Maintain proper stack trace for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StructuredError);
    }
  }
}

export class StreamingError extends StructuredError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, { ...context, operation: context.operation || 'streaming' }, 'StreamingError');
  }
}

export class AuthenticationError extends StructuredError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, { ...context, operation: context.operation || 'authentication' }, 'AuthenticationError');
  }
}

export class ValidationError extends StructuredError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, { ...context, operation: context.operation || 'validation' }, 'ValidationError');
  }
}

export class NetworkError extends StructuredError {
  public readonly statusCode?: number;
  
  constructor(message: string, statusCode?: number, context: ErrorContext = {}) {
    super(message, { ...context, operation: context.operation || 'network' }, 'NetworkError');
    this.statusCode = statusCode;
  }
}

export class AdminError extends StructuredError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, { ...context, operation: context.operation || 'admin' }, 'AdminError');
  }
}

export class IBISError extends StructuredError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, { ...context, operation: context.operation || 'ibis' }, 'IBISError');
  }
}

// Helper function to create error with context
export function createError<T extends StructuredError>(
  ErrorClass: new (message: string, context?: ErrorContext) => T,
  message: string,
  context: ErrorContext = {}
): T {
  return new ErrorClass(message, context);
}

// Error recovery patterns
export class ErrorRecovery {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    context: ErrorContext = {}
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw createError(StructuredError, `Operation failed after ${maxRetries} attempts`, {
            ...context,
            operation: `retry-${context.operation}`,
            metadata: { attempts: maxRetries, lastError: lastError.message }
          });
        }
        
        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  static async withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    context: ErrorContext = {}
  ): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      const fallbackContext = {
        ...context,
        operation: `fallback-${context.operation}`,
        metadata: { primaryError: (error as Error).message }
      };
      
      return await fallback();
    }
  }
}