// Production optimizations and cleanup utilities
import { PRODUCTION_CONFIG, isProduction } from './productionConfig';
import { productionLogger } from './productionLogger';

// Memory management utilities
export const optimizeMemory = () => {
  if (isProduction && typeof window !== 'undefined') {
    // Request garbage collection if available
    if ('gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc();
    }
    
    // Clear caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          if (name !== 'critical-assets') {
            caches.delete(name);
          }
        });
      });
    }
  }
};

// Production-safe console logging
export const productionLog = {
  debug: (...args: any[]) => {
    if (!isProduction) {
      productionLogger.info(args[0], args[1]);
    }
  },
  
  info: (...args: any[]) => {
    if (!isProduction) {
      productionLogger.info(args[0], args[1]);
    }
  },
  
  warn: (...args: any[]) => {
    productionLogger.warn(args[0], args[1]); // Always show warnings
  },
  
  error: (...args: any[]) => {
    productionLogger.error(args[0], args[1]); // Always show errors
  }
};

// Performance monitoring for critical paths only
export const performanceMonitor = {
  startTiming: (label: string) => {
    if (!isProduction) {
      performance.mark(`${label}-start`);
    }
  },
  
  endTiming: (label: string) => {
    if (!isProduction) {
      performance.mark(`${label}-end`);
      performance.measure(label, `${label}-start`, `${label}-end`);
      const measure = performance.getEntriesByName(label)[0];
      if (measure.duration > 1000) { // Only warn if > 1 second
        productionLogger.warn('Slow operation detected', { label, duration: measure.duration });
      }
    }
  }
};

// Error reporting for production
export const reportError = (error: Error, context?: any) => {
  if (isProduction) {
    // In a real app, you'd send this to your error reporting service
    productionLogger.error('Production Error', { error, context });
  } else {
    productionLogger.error('Development Error', { error, context });
  }
};