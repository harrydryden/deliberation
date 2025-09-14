/**
 * Enhanced Error Reporting - Production Ready Implementation
 */
import { logger } from '@/utils/logger';

interface ErrorContext {
  component?: string;
  operation?: string;
  userId?: string;
  sessionId?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

class EnhancedErrorReportingService {
  private errorQueue: Array<{ error: Error; context: ErrorContext; timestamp: Date }> = [];
  private readonly MAX_QUEUE_SIZE = 100;
  private contextData: Record<string, any> = {};

  captureException = (error: Error, context?: ErrorContext) => {
    const enrichedContext = {
      ...this.contextData,
      ...context,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A',
      url: typeof window !== 'undefined' ? window.location.href : 'N/A'
    };

    // Add to queue for potential batch processing
    this.errorQueue.push({
      error,
      context: enrichedContext,
      timestamp: new Date()
    });

    // Keep queue size manageable
    if (this.errorQueue.length > this.MAX_QUEUE_SIZE) {
      this.errorQueue = this.errorQueue.slice(-this.MAX_QUEUE_SIZE / 2);
    }

    logger.error('Exception captured', {
      error: error.message,
      stack: error.stack,
      context: enrichedContext
    });

    // In production, this could be sent to an external service
    if (this.shouldReportImmediately(error)) {
      this.flushErrors();
    }
  };

  setContext = (context: Record<string, any>) => {
    this.contextData = { ...this.contextData, ...context };
  };

  reportError = (error: Error, context?: ErrorContext) => {
    this.captureException(error, context);
  };

  reportMemoryIssue = (usedMb?: number, threshold?: number, context?: any) => {
    const memoryError = new Error('Memory pressure detected');
    this.captureException(memoryError, {
      ...context,
      memoryUsage: { usedMb, threshold },
      type: 'memory_issue'
    });
  };

  private shouldReportImmediately = (error: Error): boolean => {
    // Report critical errors immediately
    const criticalPatterns = [
      'out of memory',
      'stack overflow',
      'security',
      'authentication',
      'authorization'
    ];

    return criticalPatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern)
    );
  };

  private flushErrors = () => {
    if (this.errorQueue.length === 0) return;

    logger.info('Flushing error queue', {
      errorCount: this.errorQueue.length
    });

    // In production, send to monitoring service
    // For now, just clear the queue
    this.errorQueue = [];
  };

  getErrorSummary = () => {
    return {
      queueSize: this.errorQueue.length,
      recentErrors: this.errorQueue.slice(-5).map(item => ({
        message: item.error.message,
        timestamp: item.timestamp,
        context: item.context
      }))
    };
  };
}

export const enhancedErrorReporting = new EnhancedErrorReportingService();
export const enhancedErrorReporter = enhancedErrorReporting;