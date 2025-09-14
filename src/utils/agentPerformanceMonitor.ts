/**
 * Agent Performance Monitoring and Optimization Utilities
 */

interface PerformanceMetrics {
  totalTime: number;
  orchestrationTime: number;
  generationTime: number;
  modelUsed: string;
  success: boolean;
  errorType?: string;
  contextSize?: number;
  responseLength?: number;
}

interface ModelPerformance {
  averageResponseTime: number;
  successRate: number;
  totalRequests: number;
  failureReasons: string[];
  lastUsed: Date;
}

class AgentPerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private modelPerformance: Map<string, ModelPerformance> = new Map();
  private readonly maxMetricsHistory = 100;

  recordMetrics(metrics: PerformanceMetrics): void {
    // Add to history
    this.metrics.push({
      ...metrics,
      timestamp: Date.now()
    } as PerformanceMetrics & { timestamp: number });

    // Limit history size
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Update model performance
    this.updateModelPerformance(metrics);
  }

  private updateModelPerformance(metrics: PerformanceMetrics): void {
    const existing = this.modelPerformance.get(metrics.modelUsed) || {
      averageResponseTime: 0,
      successRate: 0,
      totalRequests: 0,
      failureReasons: [],
      lastUsed: new Date()
    };

    existing.totalRequests++;
    existing.lastUsed = new Date();

    if (metrics.success) {
      existing.averageResponseTime = (
        (existing.averageResponseTime * (existing.totalRequests - 1)) + metrics.totalTime
      ) / existing.totalRequests;
    } else if (metrics.errorType) {
      existing.failureReasons.push(metrics.errorType);
      // Keep only last 10 failure reasons
      if (existing.failureReasons.length > 10) {
        existing.failureReasons = existing.failureReasons.slice(-10);
      }
    }

    // Calculate success rate
    const successfulRequests = this.metrics
      .filter(m => m.modelUsed === metrics.modelUsed && m.success)
      .length;
    existing.successRate = successfulRequests / existing.totalRequests;

    this.modelPerformance.set(metrics.modelUsed, existing);
  }

  getModelRecommendation(contextSize: number, urgency: 'low' | 'medium' | 'high' = 'medium'): string {
    const models = Array.from(this.modelPerformance.entries())
      .filter(([_, perf]) => perf.successRate > 0.7) // Only consider reliable models
      .sort((a, b) => {
        // Sort by success rate and speed
        const scoreA = a[1].successRate * 0.6 + (1 / Math.max(a[1].averageResponseTime, 1000)) * 0.4;
        const scoreB = b[1].successRate * 0.6 + (1 / Math.max(b[1].averageResponseTime, 1000)) * 0.4;
        return scoreB - scoreA;
      });

    if (models.length === 0) {
      // Fallback to default model
      return 'gpt-4o-mini';
    }

    // Consider context size - gpt-4o-mini handles large contexts well
    if (contextSize > 8000) {
      // Large context - use gpt-4o-mini
      const gptModel = models.find(([model]) => 
        model.startsWith('gpt-4o-mini')
      );
      if (gptModel) return gptModel[0];
    }

    // Return best performing model
    return models[0][0];
  }

  getPerformanceInsights(): {
    averageResponseTime: number;
    overallSuccessRate: number;
    mostReliableModel: string;
    fastestModel: string;
    slowestModel: string;
    commonFailureReasons: string[];
  } {
    if (this.metrics.length === 0) {
      return {
        averageResponseTime: 0,
        overallSuccessRate: 0,
        mostReliableModel: 'unknown',
        fastestModel: 'unknown',
        slowestModel: 'unknown',
        commonFailureReasons: []
      };
    }

    const successfulMetrics = this.metrics.filter(m => m.success);
    const averageResponseTime = successfulMetrics.reduce((sum, m) => sum + m.totalTime, 0) / successfulMetrics.length;
    const overallSuccessRate = successfulMetrics.length / this.metrics.length;

    const modelEntries = Array.from(this.modelPerformance.entries());
    const mostReliableModel = modelEntries.reduce((best, current) => 
      current[1].successRate > best[1].successRate ? current : best, 
      modelEntries[0]
    )?.[0] || 'unknown';

    const fastestModel = modelEntries.reduce((fastest, current) => 
      current[1].averageResponseTime < fastest[1].averageResponseTime ? current : fastest,
      modelEntries[0]
    )?.[0] || 'unknown';

    const slowestModel = modelEntries.reduce((slowest, current) => 
      current[1].averageResponseTime > slowest[1].averageResponseTime ? current : slowest,
      modelEntries[0]
    )?.[0] || 'unknown';

    // Aggregate failure reasons
    const allFailures = modelEntries.flatMap(([_, perf]) => perf.failureReasons);
    const failureCounts = allFailures.reduce((counts, reason) => {
      counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const commonFailureReasons = Object.entries(failureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason]) => reason);

    return {
      averageResponseTime,
      overallSuccessRate,
      mostReliableModel,
      fastestModel,
      slowestModel,
      commonFailureReasons
    };
  }

  shouldTriggerCircuitBreaker(model: string): boolean {
    const performance = this.modelPerformance.get(model);
    if (!performance || performance.totalRequests < 3) return false;

    // Trigger if success rate is very low and we have recent failures
    return performance.successRate < 0.3 && 
           performance.failureReasons.length > 2 &&
           (Date.now() - performance.lastUsed.getTime()) < 300000; // Last 5 minutes
  }

  getOptimalTimeout(model: string): number {
    const performance = this.modelPerformance.get(model);
    if (!performance || performance.totalRequests < 3) {
      // Default timeouts based on model type
      if (model.startsWith('gpt-4o-mini')) return 12000;
      return 15000;
    }

    // Calculate optimal timeout based on historical performance
    // Use 2x average response time + buffer
    const optimalTimeout = Math.max(
      10000, // Minimum 10s
      Math.min(
        60000, // Maximum 60s
        performance.averageResponseTime * 2 + 5000 // 2x avg + 5s buffer
      )
    );

    return optimalTimeout;
  }

  clearMetrics(): void {
    this.metrics = [];
    this.modelPerformance.clear();
  }
}

// Singleton instance
export const performanceMonitor = new AgentPerformanceMonitor();

// Utility functions for easy usage
export const recordAgentPerformance = (metrics: PerformanceMetrics) => {
  performanceMonitor.recordMetrics(metrics);
};

export const getRecommendedModel = (contextSize: number, urgency: 'low' | 'medium' | 'high' = 'medium') => {
  return performanceMonitor.getModelRecommendation(contextSize, urgency);
};

export const getPerformanceInsights = () => {
  return performanceMonitor.getPerformanceInsights();
};

export const getOptimalTimeout = (model: string) => {
  return performanceMonitor.getOptimalTimeout(model);
};

export const shouldUseCircuitBreaker = (model: string) => {
  return performanceMonitor.shouldTriggerCircuitBreaker(model);
};
