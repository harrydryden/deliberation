// Production optimizations and cleanup utilities
import { PRODUCTION_CONFIG, isProduction } from './productionConfig';

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
      console.log(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (!isProduction) {
      console.info(...args);
    }
  },
  
  warn: (...args: any[]) => {
    console.warn(...args); // Always show warnings
  },
  
  error: (...args: any[]) => {
    console.error(...args); // Always show errors
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
        console.warn(`Slow operation detected: ${label} took ${measure.duration}ms`);
      }
    }
  }
};

// Error reporting for production
export const reportError = (error: Error, context?: any) => {
  if (isProduction) {
    // In a real app, you'd send this to your error reporting service
    // For now, just log to console
    console.error('Production Error:', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    });
  } else {
    console.error('Development Error:', error, context);
  }
};