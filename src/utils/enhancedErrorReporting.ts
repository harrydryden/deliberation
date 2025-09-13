/**
 * Enhanced Error Reporting - Minimal implementation
 */

export const enhancedErrorReporting = {
  captureException: (error: Error, context?: any) => {
    console.error('Error captured:', error, context);
  },
  setContext: (context: any) => {
    // No-op in production
  },
  reportError: (error: Error, context?: any) => {
    console.error('Error reported:', error, context);
  },
  reportMemoryIssue: (usedMb?: number, threshold?: number, context?: any) => {
    console.warn('Memory issue reported:', { usedMb, threshold, context });
  }
};

export const enhancedErrorReporter = enhancedErrorReporting;