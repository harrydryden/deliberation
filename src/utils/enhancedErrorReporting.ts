// Enhanced error reporting for production reliability
import { productionLogger } from './productionLogger';
import { StructuredError, ErrorContext } from './structuredErrors';

interface ErrorReport {
  errorId: string;
  message: string;
  stack?: string;
  errorType: string;
  context: ErrorContext;
  timestamp: number;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId?: string;
}

class EnhancedErrorReporter {
  private errorQueue: ErrorReport[] = [];
  private isReporting = false;
  private sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Report structured errors with full context
  reportError(error: Error | StructuredError, additionalContext: ErrorContext = {}) {
    const isStructured = error instanceof StructuredError;
    
    const report: ErrorReport = {
      errorId: isStructured ? error.correlationId : `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message: error.message,
      stack: error.stack,
      errorType: isStructured ? error.errorType : error.constructor.name,
      context: isStructured ? { ...error.context, ...additionalContext } : additionalContext,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.sessionId,
      userId: additionalContext.userId
    };

    // Always log errors
    productionLogger.error(`${report.errorType}: ${report.message} [${report.errorId}]`, error);

    // Queue for batch reporting in production
    if (process.env.NODE_ENV === 'production') {
      this.errorQueue.push(report);
      this.processErrorQueue();
    }
  }

  // Report performance issues as structured errors
  reportPerformanceIssue(metric: string, value: number, threshold: number, context: ErrorContext = {}) {
    if (value > threshold) {
      const performanceError = new StructuredError(
        `Performance threshold exceeded: ${metric}`,
        {
          ...context,
          operation: 'performance-monitoring',
          metadata: { metric, value, threshold, exceedBy: value - threshold }
        },
        'PerformanceError'
      );
      
      this.reportError(performanceError);
    }
  }

  // Report memory issues
  reportMemoryIssue(usedMB: number, threshold: number, context: ErrorContext = {}) {
    const memoryError = new StructuredError(
      `Memory usage exceeded threshold: ${usedMB.toFixed(2)}MB > ${threshold}MB`,
      {
        ...context,
        operation: 'memory-monitoring',
        metadata: { usedMB, threshold, availableHeap: this.getMemoryInfo() }
      },
      'MemoryError'
    );
    
    this.reportError(memoryError);
  }

  private getMemoryInfo() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  private async processErrorQueue() {
    if (this.isReporting || this.errorQueue.length === 0) return;
    
    this.isReporting = true;
    const errors = this.errorQueue.splice(0, 5); // Process up to 5 errors at once

    try {
      // In a real production app, send to error tracking service
      // await this.sendToErrorService(errors);
      
      productionLogger.error(`Batch error report: ${errors.length} errors from session ${this.sessionId}`);
      
    } catch (reportingError) {
      productionLogger.error('Failed to report error batch', reportingError as Error);
      // Put errors back in queue for retry
      this.errorQueue.unshift(...errors);
    } finally {
      this.isReporting = false;
      
      // Process remaining errors after delay
      if (this.errorQueue.length > 0) {
        setTimeout(() => this.processErrorQueue(), 10000);
      }
    }
  }

  // Get error analytics for debugging
  getErrorAnalytics() {
    const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
    const recentErrors = this.errorQueue.filter(e => e.timestamp > last24Hours);
    
    const errorsByType = recentErrors.reduce((acc, error) => {
      acc[error.errorType] = (acc[error.errorType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalErrors: recentErrors.length,
      errorsByType,
      sessionId: this.sessionId,
      queueLength: this.errorQueue.length
    };
  }
}

export const enhancedErrorReporter = new EnhancedErrorReporter();

// Helper function for React Error Boundaries
export const reportBoundaryError = (error: Error, errorInfo: any, componentName: string) => {
  enhancedErrorReporter.reportError(error, {
    component: componentName,
    operation: 'error-boundary',
    metadata: { errorInfo }
  });
};

// Helper function for async operations
export const withErrorReporting = async <T>(
  operation: () => Promise<T>,
  context: ErrorContext
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    enhancedErrorReporter.reportError(error as Error, context);
    throw error;
  }
};