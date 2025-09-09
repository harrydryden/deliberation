/**
 * Simple performance monitoring utility for chat UI optimization validation
 */
import { useEffect } from 'react';
import { productionLogger } from './productionLogger';

interface PerformanceMetrics {
  renderCount: number;
  lastRender: number;
  avgRenderTime: number;
}

class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetrics>();
  private enabled = false; // Completely disabled in production

  trackRender(componentName: string, startTime: number = performance.now()) {
    // Completely disabled for performance
    return;
  }

  getMetrics(componentName?: string) {
    return {};
  }

  reset(componentName?: string) {
    // No-op
  }

  logSummary() {
    // No-op
  }
}

export const performanceMonitor = new PerformanceMonitor();

// React hook for component performance tracking - disabled for performance
export const usePerformanceTracker = (componentName: string) => {
  // No-op for performance
};