import React, { useEffect, useRef } from 'react';
import { logger } from './logger';

interface RenderStats {
  count: number;
  lastRender: number;
  avgTime: number;
  totalTime: number;
  maxTime: number;
}

class RenderPerformanceMonitor {
  private stats = new Map<string, RenderStats>();
  private enabled = process.env.NODE_ENV === 'development';
  
  trackRender(componentName: string, startTime: number = performance.now()) {
    if (!this.enabled) return;
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    const existing = this.stats.get(componentName) || {
      count: 0,
      lastRender: 0,
      avgTime: 0,
      totalTime: 0,
      maxTime: 0
    };
    
    const newCount = existing.count + 1;
    const newTotalTime = existing.totalTime + renderTime;
    
    this.stats.set(componentName, {
      count: newCount,
      lastRender: endTime,
      avgTime: newTotalTime / newCount,
      totalTime: newTotalTime,
      maxTime: Math.max(existing.maxTime, renderTime)
    });
    
    // Warn about excessive render times
    if (renderTime > 50) {
      logger.warn(`🐌 Slow render detected: ${componentName}`, {
        renderTime: `${renderTime.toFixed(2)}ms`,
        renderCount: newCount
      });
    }
    
    // Warn about excessive re-renders
    if (newCount > 50 && newCount % 25 === 0) {
      logger.warn(`🔄 Excessive re-renders: ${componentName}`, {
        renderCount: newCount,
        avgTime: `${existing.avgTime.toFixed(2)}ms`
      });
    }
  }
  
  getStats(componentName?: string) {
    if (componentName) {
      return this.stats.get(componentName);
    }
    return Object.fromEntries(this.stats);
  }
  
  reset(componentName?: string) {
    if (componentName) {
      this.stats.delete(componentName);
    } else {
      this.stats.clear();
    }
  }
  
  logSummary() {
    if (!this.enabled || this.stats.size === 0) return;
    
    logger.info('🏁 Render Performance Summary', {
      components: Array.from(this.stats.entries()).map(([name, stat]) => ({
        component: name,
        renders: stat.count,
        avgTime: `${stat.avgTime.toFixed(2)}ms`,
        maxTime: `${stat.maxTime.toFixed(2)}ms`,
        totalTime: `${stat.totalTime.toFixed(2)}ms`
      }))
    });
  }
}

export const renderMonitor = new RenderPerformanceMonitor();

/**
 * React hook for tracking component render performance
 */
export const useRenderPerformanceTracker = (componentName: string) => {
  const startTimeRef = useRef<number>();
  
  // Track render start
  startTimeRef.current = performance.now();
  
  useEffect(() => {
    // Track render completion
    if (startTimeRef.current) {
      renderMonitor.trackRender(componentName, startTimeRef.current);
    }
  });
  
  // Cleanup stats on unmount
  useEffect(() => {
    return () => {
      // Don't reset stats on unmount to preserve data for debugging
    };
  }, [componentName]);
};

/**
 * Higher-order component for automatic render tracking
 */
export const withRenderTracking = <P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) => {
  const TrackedComponent = (props: P) => {
    const name = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Unknown';
    useRenderPerformanceTracker(name);
    return <WrappedComponent {...props} />;
  };
  
  TrackedComponent.displayName = `withRenderTracking(${componentName || WrappedComponent.displayName || WrappedComponent.name})`;
  return TrackedComponent;
};