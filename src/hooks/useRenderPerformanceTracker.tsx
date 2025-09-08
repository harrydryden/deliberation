// Track React component render performance and identify slow renders
import { useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import { logger } from '@/utils/logger';

interface RenderMetrics {
  componentName: string;
  renderCount: number;
  totalRenderTime: number;
  averageRenderTime: number;
  slowRenderCount: number;
  lastRenderTime: number;
  longestRenderTime: number;
  mountTime: number;
}

const SLOW_RENDER_THRESHOLD = 16.67; // 60fps threshold
const renderMetricsMap = new Map<string, RenderMetrics>();

export const useRenderPerformanceTracker = (componentName: string, logFrequency: number = 10) => {
  const renderStartRef = useRef<number>(0);
  const renderCountRef = useRef(0);
  const mountTimeRef = useRef(Date.now());

  // Initialize metrics
  useEffect(() => {
    if (!renderMetricsMap.has(componentName)) {
      renderMetricsMap.set(componentName, {
        componentName,
        renderCount: 0,
        totalRenderTime: 0,
        averageRenderTime: 0,
        slowRenderCount: 0,
        lastRenderTime: 0,
        longestRenderTime: 0,
        mountTime: Date.now()
      });
    }
  }, [componentName]);

  // Start timing before render
  const startRenderTiming = useCallback(() => {
    renderStartRef.current = performance.now();
  }, []);

  // End timing after render
  useLayoutEffect(() => {
    const renderEndTime = performance.now();
    const renderTime = renderEndTime - renderStartRef.current;
    renderCountRef.current++;

    // Update metrics
    const metrics = renderMetricsMap.get(componentName);
    if (metrics) {
      metrics.renderCount++;
      metrics.totalRenderTime += renderTime;
      metrics.averageRenderTime = metrics.totalRenderTime / metrics.renderCount;
      metrics.lastRenderTime = renderTime;
      
      if (renderTime > metrics.longestRenderTime) {
        metrics.longestRenderTime = renderTime;
      }
      
      if (renderTime > SLOW_RENDER_THRESHOLD) {
        metrics.slowRenderCount++;
      }

      // Log periodically or if render is slow
      const shouldLog = metrics.renderCount % logFrequency === 0 || renderTime > SLOW_RENDER_THRESHOLD;
      
      if (shouldLog) {
        const isSlow = renderTime > SLOW_RENDER_THRESHOLD;
        console.log(`🖼️ [RENDER-PERF] ${componentName} render #${metrics.renderCount}`, {
          renderTime: `${renderTime.toFixed(2)}ms`,
          performance: isSlow ? '🐌 SLOW' : '⚡ FAST',
          averageTime: `${metrics.averageRenderTime.toFixed(2)}ms`,
          slowRenderPercentage: `${((metrics.slowRenderCount / metrics.renderCount) * 100).toFixed(1)}%`,
          totalRenders: metrics.renderCount
        });

        if (isSlow) {
          logger.warn(`Slow render detected in ${componentName}`, {
            renderTime,
            renderCount: metrics.renderCount,
            averageTime: metrics.averageRenderTime
          });
        }
      }
    }

    // Start timing for next render
    renderStartRef.current = performance.now();
  });

  // Get current metrics
  const getMetrics = useCallback((): RenderMetrics | null => {
    return renderMetricsMap.get(componentName) || null;
  }, [componentName]);

  // Force log current metrics
  const logCurrentMetrics = useCallback(() => {
    const metrics = getMetrics();
    if (metrics) {
      console.log(`📊 [RENDER-PERF] ${componentName} summary`, {
        totalRenders: metrics.renderCount,
        averageRenderTime: `${metrics.averageRenderTime.toFixed(2)}ms`,
        longestRenderTime: `${metrics.longestRenderTime.toFixed(2)}ms`,
        slowRenderPercentage: `${((metrics.slowRenderCount / metrics.renderCount) * 100).toFixed(1)}%`,
        componentAge: `${Date.now() - metrics.mountTime}ms`
      });
    }
  }, [componentName, getMetrics]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const metrics = getMetrics();
      if (metrics && metrics.renderCount > 0) {
        console.log(`🏁 [RENDER-PERF] ${componentName} final summary`, {
          totalRenders: metrics.renderCount,
          totalRenderTime: `${metrics.totalRenderTime.toFixed(2)}ms`,
          averageRenderTime: `${metrics.averageRenderTime.toFixed(2)}ms`,
          slowRenderCount: metrics.slowRenderCount,
          componentLifetime: `${Date.now() - metrics.mountTime}ms`
        });
      }
    };
  }, [componentName, getMetrics]);

  // Initialize render timing
  useLayoutEffect(() => {
    renderStartRef.current = performance.now();
  });

  return {
    startRenderTiming,
    getMetrics,
    logCurrentMetrics
  };
};

// Global function to get all render metrics
export const getAllRenderMetrics = () => {
  return Array.from(renderMetricsMap.values());
};

// Global function to reset all metrics
export const resetAllRenderMetrics = () => {
  renderMetricsMap.clear();
};