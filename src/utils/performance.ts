// Performance monitoring utilities

export const performanceMonitor = {
  startTime: 0,
  
  start: (label?: string) => {
    performanceMonitor.startTime = performance.now();
    if (label) console.time(label);
  },
  
  end: (label?: string): number => {
    const duration = performance.now() - performanceMonitor.startTime;
    if (label) {
      console.timeEnd(label);
      console.log(`⚡ ${label} took ${duration.toFixed(2)}ms`);
    }
    return duration;
  },
  
  measure: async <T>(fn: () => Promise<T>, label?: string): Promise<T> => {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      if (label) console.log(`⚡ ${label} completed in ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      if (label) console.log(`❌ ${label} failed after ${duration.toFixed(2)}ms`);
      throw error;
    }
  }
};

// Debounce utility for performance
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Simple throttle utility
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};