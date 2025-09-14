// Centralized error handling utilities
import { logger } from './logger';
import { TypedError, ErrorDetails } from '@/types/common';

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public context?: ErrorDetails,
    public original?: Error
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack
    };
  }
}

export class NetworkError extends AppError {
  constructor(message: string, public status?: number, context?: ErrorDetails) {
    super(message, 'NETWORK_ERROR', { ...context, status });
    this.name = 'NetworkError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string, context?: ErrorDetails) {
    super(message, 'VALIDATION_ERROR', { ...context, field });
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, context?: ErrorDetails) {
    super(message, 'AUTH_ERROR', context);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string, context?: ErrorDetails) {
    super(message, 'AUTHORIZATION_ERROR', context);
    this.name = 'AuthorizationError';
  }
}

// Error classification utility
export function classifyError(error: unknown): TypedError {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      details: error.context,
      stack: error.stack
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'UNKNOWN_ERROR',
      stack: error.stack
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      code: 'STRING_ERROR'
    };
  }

  return {
    message: 'An unknown error occurred',
    code: 'UNHANDLED_ERROR',
    details: { originalError: error }
  };
}

// Error reporting utility
export class ErrorReporter {
  private static instance: ErrorReporter;
  private errorQueue: TypedError[] = [];
  private isReporting = false;

  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter();
    }
    return ErrorReporter.instance;
  }

  report(error: unknown, context?: ErrorDetails): void {
    const typedError = classifyError(error);
    
    // Add context
    if (context) {
      typedError.details = { ...typedError.details, ...context };
    }

    // Log immediately
    logger.error('Error reported', typedError);

    // Queue for batch reporting
    this.errorQueue.push(typedError);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isReporting || this.errorQueue.length === 0) {
      return;
    }

    this.isReporting = true;
    const errors = [...this.errorQueue];
    this.errorQueue = [];

    try {
      // In production, send to error reporting service
      if ((((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'production')) {
        await this.sendToErrorService(errors);
      }
    } catch (reportingError) {
      logger.error('Failed to report errors', reportingError);
      // Re-queue errors if reporting failed
      this.errorQueue.unshift(...errors);
    } finally {
      this.isReporting = false;
    }
  }

  private async sendToErrorService(errors: TypedError[]): Promise<void> {
    // Placeholder for error reporting service integration
    // Could integrate with Sentry, LogRocket, etc.
    logger.info('Would send errors to reporting service', { count: errors.length });
  }

  getQueueSize(): number {
    return this.errorQueue.length;
  }

  clearQueue(): void {
    this.errorQueue = [];
  }
}

export const errorReporter = ErrorReporter.getInstance();

// React error boundary helper
export function createErrorBoundary(componentName: string) {
  return class extends Error {
    constructor(error: Error, errorInfo: React.ErrorInfo) {
      super(error.message);
      this.name = `${componentName}Error`;
      this.stack = error.stack;

      errorReporter.report(error, {
        component: componentName,
        errorInfo: errorInfo.componentStack
      });
    }
  };
}

// Async error handler wrapper
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      errorReporter.report(error, { 
        function: fn.name,
        context,
        arguments: args.map((arg, index) => ({ index, type: typeof arg }))
      });
      throw error;
    }
  }) as T;
}

// Retry mechanism with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = (error) => !(error instanceof AuthenticationError)
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      logger.warn(`Operation failed, retrying in ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries,
        error: classifyError(error)
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Error recovery utilities
export const ErrorRecovery = {
  // Graceful degradation
  fallback: <T>(primary: () => T, fallback: () => T, context?: string): T => {
    try {
      return primary();
    } catch (error) {
      logger.warn('Primary operation failed, using fallback', { context, error: classifyError(error) });
      errorReporter.report(error, { context, strategy: 'fallback' });
      return fallback();
    }
  },

  // Safe execution with default value
  safe: <T>(operation: () => T, defaultValue: T, context?: string): T => {
    try {
      return operation();
    } catch (error) {
      logger.warn('Operation failed, using default value', { context, error: classifyError(error) });
      errorReporter.report(error, { context, strategy: 'safe_default' });
      return defaultValue;
    }
  },

  // Circuit breaker pattern
  circuitBreaker: <T extends (...args: any[]) => Promise<any>>(
    operation: T, 
    threshold: number = 5, 
    timeout: number = 60000
  ): T => {
    let failures = 0;
    let lastFailure = 0;
    let isOpen = false;

    return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      if (isOpen && Date.now() - lastFailure < timeout) {
        throw new AppError('Circuit breaker is open', 'CIRCUIT_OPEN');
      }

      try {
        const result = await operation(...args);
        failures = 0;
        isOpen = false;
        return result;
      } catch (error) {
        failures++;
        lastFailure = Date.now();

        if (failures >= threshold) {
          isOpen = true;
          logger.error('Circuit breaker opened', { failures, threshold });
        }

        throw error;
      }
    }) as T;
  }
};

// User-friendly error messages
export const ErrorMessages = {
  network: 'Unable to connect to the server. Please check your internet connection.',
  timeout: 'The operation took too long to complete. Please try again.',
  unauthorized: 'You are not authorized to perform this action.',
  forbidden: 'Access denied. You do not have permission to access this resource.',
  notFound: 'The requested resource was not found.',
  validation: 'Please check your input and try again.',
  server: 'A server error occurred. Please try again later.',
  unknown: 'An unexpected error occurred. Please try again.',

  // Context-specific messages
  auth: {
    invalidCredentials: 'Invalid access code. Please check and try again.',
    sessionExpired: 'Your session has expired. Please sign in again.',
    accountLocked: 'Your account has been temporarily locked due to too many failed attempts.'
  },

  upload: {
    fileTooLarge: 'The file is too large. Please choose a smaller file.',
    invalidFormat: 'Invalid file format. Please choose a supported file type.',
    uploadFailed: 'File upload failed. Please try again.'
  }
};