/**
 * Performance Optimization Service
 * Centralized service for performance monitoring and optimization
 */

import { logger } from '@/utils/logger';

export interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  memoryUsage?: number;
  context?: Record<string, any>;
}

export class PerformanceOptimizationService {
  private static metrics: Map<string, PerformanceMetrics[]> = new Map();
  private static readonly MAX_METRICS_PER_OPERATION = 100;

  /**
   * Start performance tracking for an operation
   */
  static startTracking(operation: string, context?: Record<string, any>): string {
    const trackingId = `${operation}_${Date.now()}_${Math.random()}`;
    const metric: PerformanceMetrics = {
      operation,
      startTime: performance.now(),
      success: false,
      context
    };

    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const operationMetrics = this.metrics.get(operation)!;
    operationMetrics.push(metric);

    // Keep only latest metrics to prevent memory leaks
    if (operationMetrics.length > this.MAX_METRICS_PER_OPERATION) {
      operationMetrics.shift();
    }

    return trackingId;
  }

  /**
   * End performance tracking for an operation
   */
  static endTracking(operation: string, success: boolean = true, context?: Record<string, any>): void {
    const operationMetrics = this.metrics.get(operation);
    if (!operationMetrics || operationMetrics.length === 0) {
      return;
    }

    const metric = operationMetrics[operationMetrics.length - 1];
    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;
    
    if (context) {
      metric.context = { ...metric.context, ...context };
    }

    // Log slow operations
    if (metric.duration > 1000) {
      logger.warn('Slow operation detected', {
        operation: metric.operation,
        duration: metric.duration,
        context: metric.context
      });
    }

    // Track memory usage if available
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      metric.memoryUsage = memory.usedJSHeapSize;
    }
  }

  /**
   * Get performance metrics for an operation
   */
  static getMetrics(operation: string): PerformanceMetrics[] {
    return this.metrics.get(operation) || [];
  }

  /**
   * Get performance summary for an operation
   */
  static getPerformanceSummary(operation: string): {
    averageDuration: number;
    successRate: number;
    totalOperations: number;
    slowOperations: number;
  } {
    const metrics = this.getMetrics(operation);
    const completedMetrics = metrics.filter(m => m.duration !== undefined);
    
    if (completedMetrics.length === 0) {
      return {
        averageDuration: 0,
        successRate: 0,
        totalOperations: 0,
        slowOperations: 0
      };
    }

    const totalDuration = completedMetrics.reduce((sum, m) => sum + (m.duration!), 0);
    const successfulOperations = completedMetrics.filter(m => m.success).length;
    const slowOperations = completedMetrics.filter(m => m.duration! > 1000).length;

    return {
      averageDuration: totalDuration / completedMetrics.length,
      successRate: successfulOperations / completedMetrics.length,
      totalOperations: completedMetrics.length,
      slowOperations
    };
  }

  /**
   * Clear metrics for an operation (useful for memory management)
   */
  static clearMetrics(operation: string): void {
    this.metrics.delete(operation);
  }

  /**
   * Clear all metrics
   */
  static clearAllMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Get current memory usage (if available)
   */
  static getCurrentMemoryUsage(): number | null {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return memory.usedJSHeapSize;
    }
    return null;
  }

  /**
   * Monitor a function's performance
   */
  static async monitorAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    this.startTracking(operation, context);
    
    try {
      const result = await fn();
      this.endTracking(operation, true);
      return result;
    } catch (error) {
      this.endTracking(operation, false, { error: error.message });
      throw error;
    }
  }

  /**
   * Monitor a synchronous function's performance
   */
  static monitor<T>(
    operation: string,
    fn: () => T,
    context?: Record<string, any>
  ): T {
    this.startTracking(operation, context);
    
    try {
      const result = fn();
      this.endTracking(operation, true);
      return result;
    } catch (error) {
      this.endTracking(operation, false, { error: error.message });
      throw error;
    }
  }

  /**
   * Get overall system performance summary
   */
  static getSystemPerformanceSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    for (const [operation, metrics] of this.metrics.entries()) {
      summary[operation] = this.getPerformanceSummary(operation);
    }

    return {
      operations: summary,
      totalMetrics: Array.from(this.metrics.values()).reduce((sum, arr) => sum + arr.length, 0),
      currentMemoryUsage: this.getCurrentMemoryUsage()
    };
  }
}
