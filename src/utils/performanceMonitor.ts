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
  private enabled = process.env.NODE_ENV === 'development';

  trackRender(componentName: string, startTime: number = performance.now()) {
    if (!this.enabled) return;

    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    const existing = this.metrics.get(componentName) || {
      renderCount: 0,
      lastRender: 0,
      avgRenderTime: 0
    };

    const newCount = existing.renderCount + 1;
    const newAvg = (existing.avgRenderTime * existing.renderCount + renderTime) / newCount;

    this.metrics.set(componentName, {
      renderCount: newCount,
      lastRender: endTime,
      avgRenderTime: newAvg
    });

    // Log excessive re-renders (more than 10 renders in 5 seconds)
    if (newCount > 10 && (endTime - existing.lastRender) < 5000) {
      productionLogger.warn('Excessive re-renders detected', { componentName, renderCount: newCount });
    }
  }

  getMetrics(componentName?: string) {
    if (componentName) {
      return this.metrics.get(componentName);
    }
    return Object.fromEntries(this.metrics);
  }

  reset(componentName?: string) {
    if (componentName) {
      this.metrics.delete(componentName);
    } else {
      this.metrics.clear();
    }
  }

  logSummary() {
    if (!this.enabled) return;

    productionLogger.info('Performance Summary');
    for (const [component, metrics] of this.metrics) {
      productionLogger.info('Component performance', { component, metrics: { renderCount: metrics.renderCount, avgRenderTime: metrics.avgRenderTime.toFixed(2) }});
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();

// React hook for component performance tracking
export const usePerformanceTracker = (componentName: string) => {
  const startTime = performance.now();
  
  useEffect(() => {
    performanceMonitor.trackRender(componentName, startTime);
  });
};