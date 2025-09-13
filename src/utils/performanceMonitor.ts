/**
 * Performance Monitor - Minimal implementation for production
 */

export const performanceMonitor = {
  mark: (name: string) => {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name);
    }
  },
  measure: (name: string, startMark?: string, endMark?: string) => {
    if (typeof performance !== 'undefined' && performance.measure) {
      try {
        return performance.measure(name, startMark, endMark);
      } catch (e) {
        // Ignore measurement errors
      }
    }
  }
};