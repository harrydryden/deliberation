/**
 * Production Optimizations - Minimal implementation
 */

export const productionOptimizations = {
  enableOptimizations: () => {
    // No-op for now
  },
  disableDevtools: () => {
    // No-op for now
  }
};

export const reportError = (error: Error, context?: any) => {
  console.error('Production error:', error, context);
};