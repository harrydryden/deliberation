// Frontend performance monitoring specifically for streaming agent responses
import { useCallback, useRef, useEffect } from 'react';
import { logger } from '@/utils/logger';

interface StreamingPerformanceMetrics {
  requestStart: number;
  firstChunk: number;
  streamComplete: number;
  uiStart: number;
  uiUpdate: number;
  renderTime: number;
  totalTime: number;
  chunkCount: number;
  errorOccurred: boolean;
  networkLatency: number;
  processingTime: number;
}

export const useStreamingPerformanceMonitor = () => {
  const metricsRef = useRef<Partial<StreamingPerformanceMetrics>>({});
  const renderStartRef = useRef<number>(0);
  const chunkTimesRef = useRef<number[]>([]);

  // Start tracking a new streaming session
  const startTracking = useCallback((messageId: string) => {
    const now = performance.now();
    
    metricsRef.current = {
      requestStart: now,
      chunkCount: 0,
      errorOccurred: false
    };
    
    chunkTimesRef.current = [];
    renderStartRef.current = now;
    
    console.log(`🎯 [PERF] Starting streaming performance tracking for message: ${messageId}`, {
      timestamp: now,
      userAgent: navigator.userAgent.slice(0, 50),
      connection: (navigator as any).connection?.effectiveType || 'unknown'
    });
  }, []);

  // Record when first chunk arrives
  const recordFirstChunk = useCallback(() => {
    const now = performance.now();
    if (metricsRef.current.requestStart) {
      metricsRef.current.firstChunk = now;
      metricsRef.current.networkLatency = now - metricsRef.current.requestStart;
      
      console.log(`🚀 [PERF] First chunk received`, {
        networkLatency: `${metricsRef.current.networkLatency.toFixed(2)}ms`,
        timeToFirstChunk: `${(now - metricsRef.current.requestStart).toFixed(2)}ms`
      });
    }
  }, []);

  // Record each streaming chunk
  const recordChunk = useCallback((chunkSize: number) => {
    const now = performance.now();
    chunkTimesRef.current.push(now);
    
    if (metricsRef.current.chunkCount !== undefined) {
      metricsRef.current.chunkCount++;
    }
    
    // Log every 10th chunk to avoid spam
    if (metricsRef.current.chunkCount % 10 === 0) {
      const avgChunkTime = chunkTimesRef.current.length > 1 
        ? (chunkTimesRef.current[chunkTimesRef.current.length - 1] - chunkTimesRef.current[0]) / chunkTimesRef.current.length
        : 0;
        
      console.log(`📦 [PERF] Chunk ${metricsRef.current.chunkCount}`, {
        chunkSize: `${chunkSize} chars`,
        avgChunkInterval: `${avgChunkTime.toFixed(2)}ms`,
        totalChunks: metricsRef.current.chunkCount
      });
    }
  }, []);

  // Record UI state changes
  const recordUIStart = useCallback(() => {
    metricsRef.current.uiStart = performance.now();
    console.log(`🎨 [PERF] UI state change started`, {
      timestamp: metricsRef.current.uiStart
    });
  }, []);

  const recordUIUpdate = useCallback(() => {
    const now = performance.now();
    metricsRef.current.uiUpdate = now;
    
    if (metricsRef.current.uiStart) {
      const uiLatency = now - metricsRef.current.uiStart;
      console.log(`🎨 [PERF] UI update completed`, {
        uiLatency: `${uiLatency.toFixed(2)}ms`,
        timestamp: now
      });
    }
  }, []);

  // Record render performance
  const recordRenderStart = useCallback(() => {
    renderStartRef.current = performance.now();
  }, []);

  const recordRenderEnd = useCallback(() => {
    if (renderStartRef.current) {
      const renderTime = performance.now() - renderStartRef.current;
      metricsRef.current.renderTime = renderTime;
      
      console.log(`🖼️ [PERF] Render completed`, {
        renderTime: `${renderTime.toFixed(2)}ms`,
        isSlowRender: renderTime > 16.67 ? '⚠️ SLOW' : '✅ FAST'
      });
    }
  }, []);

  // Record streaming completion
  const recordStreamComplete = useCallback((success: boolean, finalMessageLength?: number) => {
    const now = performance.now();
    metricsRef.current.streamComplete = now;
    metricsRef.current.errorOccurred = !success;
    
    if (metricsRef.current.requestStart) {
      metricsRef.current.totalTime = now - metricsRef.current.requestStart;
      metricsRef.current.processingTime = metricsRef.current.firstChunk 
        ? now - metricsRef.current.firstChunk 
        : 0;
    }

    // Calculate comprehensive metrics
    const metrics = metricsRef.current as StreamingPerformanceMetrics;
    
    const performanceReport = {
      success,
      totalTime: `${metrics.totalTime?.toFixed(2)}ms`,
      networkLatency: `${metrics.networkLatency?.toFixed(2)}ms`,
      processingTime: `${metrics.processingTime?.toFixed(2)}ms`,
      firstChunkTime: `${(metrics.firstChunk - metrics.requestStart)?.toFixed(2)}ms`,
      totalChunks: metrics.chunkCount,
      avgChunkSize: finalMessageLength ? Math.round(finalMessageLength / metrics.chunkCount) : 0,
      renderTime: `${metrics.renderTime?.toFixed(2)}ms`,
      performanceGrade: getPerformanceGrade(metrics.totalTime),
      bottleneckAnalysis: analyzeBottlenecks(metrics)
    };

    console.log(`🏁 [PERF] Streaming session complete`, performanceReport);
    
    // Log to structured logger for analytics
    logger.performance.mark('Streaming session complete', performanceReport);

    return performanceReport;
  }, []);

  // Record error
  const recordError = useCallback((error: string) => {
    metricsRef.current.errorOccurred = true;
    const now = performance.now();
    
    const errorReport = {
      error,
      timeToError: metricsRef.current.requestStart 
        ? `${(now - metricsRef.current.requestStart).toFixed(2)}ms`
        : 'unknown',
      chunksReceived: metricsRef.current.chunkCount || 0
    };
    
    console.error(`💥 [PERF] Streaming error occurred`, errorReport);
    logger.error('Streaming performance error', new Error(error), errorReport);
  }, []);

  // Memory monitoring
  const recordMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      console.log(`🧠 [PERF] Memory usage`, {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`,
        usage: `${((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1)}%`
      });
    }
  }, []);

  return {
    startTracking,
    recordFirstChunk,
    recordChunk,
    recordUIStart,
    recordUIUpdate,
    recordRenderStart,
    recordRenderEnd,
    recordStreamComplete,
    recordError,
    recordMemoryUsage,
    getCurrentMetrics: () => metricsRef.current
  };
};

// Helper function to grade performance
function getPerformanceGrade(totalTime: number): string {
  if (totalTime < 2000) return '🚀 EXCELLENT';
  if (totalTime < 5000) return '✅ GOOD';
  if (totalTime < 10000) return '⚠️ SLOW';
  return '🐌 VERY SLOW';
}

// Analyze where bottlenecks occur
function analyzeBottlenecks(metrics: StreamingPerformanceMetrics) {
  const analysis = [];
  
  if (metrics.networkLatency > 2000) {
    analysis.push('🌐 HIGH NETWORK LATENCY');
  }
  
  if (metrics.processingTime > metrics.networkLatency * 2) {
    analysis.push('⚡ SLOW SERVER PROCESSING');
  }
  
  if (metrics.renderTime > 100) {
    analysis.push('🎨 SLOW UI RENDERING');
  }
  
  if (metrics.chunkCount < 5) {
    analysis.push('📦 FEW CHUNKS - LARGE PAYLOAD');
  }
  
  return analysis.length > 0 ? analysis : ['✅ NO MAJOR BOTTLENECKS DETECTED'];
}