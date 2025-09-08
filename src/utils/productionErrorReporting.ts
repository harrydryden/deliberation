// Production error reporting and monitoring
import { isProduction } from './productionConfig';

interface ErrorReport {
  message: string;
  stack?: string;
  componentName?: string;
  userId?: string;
  url: string;
  userAgent: string;
  timestamp: number;
  context?: any;
}

class ProductionErrorReporter {
  private errorQueue: ErrorReport[] = [];
  private isReporting = false;

  // Report critical errors to external service (simulate for now)
  async reportError(error: Error, context?: any) {
    const report: ErrorReport = {
      message: error.message,
      stack: error.stack,
      componentName: context?.componentName,
      userId: context?.userId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
      context: context?.additionalInfo
    };

    if (isProduction) {
      // In production, queue errors for batch reporting
      this.errorQueue.push(report);
      this.processErrorQueue();
    } else {
      // In development, just log
      console.error('Development Error:', report);
    }
  }

  private async processErrorQueue() {
    if (this.isReporting || this.errorQueue.length === 0) return;
    
    this.isReporting = true;
    const errors = this.errorQueue.splice(0, 10); // Process up to 10 errors

    try {
      // Here you would send to your error reporting service
      // For now, we'll just log critical errors
      console.error('Production Error Batch:', errors.length, 'errors');
      
      // You could integrate with services like:
      // - Sentry: await Sentry.captureException(error)
      // - LogRocket: LogRocket.captureException(error)
      // - Custom API: await fetch('/api/errors', { method: 'POST', body: JSON.stringify(errors) })
      
    } catch (reportingError) {
      console.error('Failed to report errors:', reportingError);
      // Put errors back in queue for retry
      this.errorQueue.unshift(...errors);
    } finally {
      this.isReporting = false;
      
      // Process remaining errors after delay
      if (this.errorQueue.length > 0) {
        setTimeout(() => this.processErrorQueue(), 5000);
      }
    }
  }

  // Report performance issues
  reportPerformanceIssue(metric: string, value: number, threshold: number) {
    if (value > threshold) {
      this.reportError(new Error(`Performance issue: ${metric}`), {
        additionalInfo: { metric, value, threshold }
      });
    }
  }
}

export const errorReporter = new ProductionErrorReporter();

// Enhanced error boundary with reporting
export const reportBoundaryError = (error: Error, errorInfo: any, componentName: string) => {
  errorReporter.reportError(error, {
    componentName,
    additionalInfo: errorInfo
  });
};