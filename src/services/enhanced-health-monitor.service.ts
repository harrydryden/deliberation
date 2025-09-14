/**
 * Enhanced Health Monitoring Service - Production Ready
 */
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { enhancedErrorReporting } from '@/utils/enhancedErrorReporting';

interface HealthCheck {
  name: string;
  check: () => Promise<HealthResult>;
  timeout: number;
  critical: boolean;
}

interface HealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  metadata?: Record<string, any>;
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthResult>;
  timestamp: Date;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    critical_failures: number;
  };
}

class EnhancedHealthMonitorService {
  private checks = new Map<string, HealthCheck>();
  private lastHealthReport: SystemHealth | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_INTERVAL = 60000; // 1 minute
  private isMonitoring = false;

  constructor() {
    this.registerDefaultChecks();
  }

  private registerDefaultChecks(): void {
    // Database connectivity check
    this.registerCheck({
      name: 'database',
      check: this.checkDatabase.bind(this),
      timeout: 5000,
      critical: true
    });

    // Memory health check
    this.registerCheck({
      name: 'memory',
      check: this.checkMemoryHealth.bind(this),
      timeout: 2000,
      critical: false
    });

    // Performance check
    this.registerCheck({
      name: 'performance',
      check: this.checkPerformance.bind(this),
      timeout: 3000,
      critical: false
    });

    // AI service connectivity
    this.registerCheck({
      name: 'ai_service',
      check: this.checkAIService.bind(this),
      timeout: 10000,
      critical: false
    });

    // Real-time connectivity
    this.registerCheck({
      name: 'realtime',
      check: this.checkRealtimeConnection.bind(this),
      timeout: 5000,
      critical: false
    });
  }

  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
    logger.debug(`Health check registered: ${check.name}`);
  }

  async runHealthCheck(): Promise<SystemHealth> {
    const startTime = Date.now();
    const results: Record<string, HealthResult> = {};
    const promises: Promise<void>[] = [];

    // Run all health checks in parallel
    for (const [name, check] of this.checks) {
      promises.push(this.executeCheck(name, check, results));
    }

    await Promise.all(promises);

    // Calculate overall health
    const summary = this.calculateSummary(results);
    const overall = this.determineOverallHealth(results, summary);

    const health: SystemHealth = {
      overall,
      checks: results,
      timestamp: new Date(),
      summary
    };

    this.lastHealthReport = health;
    
    // Log health status
    const duration = Date.now() - startTime;
    logger.info('Health check completed', {
      overall,
      duration: `${duration}ms`,
      summary
    });

    // Report critical issues
    if (summary.critical_failures > 0) {
    enhancedErrorReporting.captureException(
      new Error(`Critical health check failures detected`),
      { 
        component: 'HealthMonitor',
        metadata: { health, criticalFailures: summary.critical_failures }
      }
    );
    }

    return health;
  }

  private async executeCheck(name: string, check: HealthCheck, results: Record<string, HealthResult>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
      );

      const result = await Promise.race([
        check.check(),
        timeoutPromise
      ]);

      results[name] = {
        ...result,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      results[name] = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      };

      logger.error(`Health check failed: ${name}`, error as Error);
    }
  }

  private async checkDatabase(): Promise<HealthResult> {
    try {
      const { error } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

      if (error) throw error;

      return { 
        status: 'healthy',
        message: 'Database connection successful'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async checkMemoryHealth(): Promise<HealthResult> {
    if (!('memory' in performance)) {
      return {
        status: 'degraded',
        message: 'Memory API not available'
      };
    }

    const memory = (performance as any).memory;
    const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
    const usage = (usedMB / totalMB) * 100;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Memory usage: ${usedMB}MB (${usage.toFixed(1)}%)`;

    if (usage > 90) {
      status = 'unhealthy';
      message += ' - Critical memory pressure';
    } else if (usage > 75) {
      status = 'degraded';
      message += ' - High memory usage';
    }

    return {
      status,
      message,
      metadata: { usedMB, totalMB, usage }
    };
  }

  private async checkPerformance(): Promise<HealthResult> {
    const startTime = performance.now();
    
    // Simulate a small computation
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      sum += Math.sqrt(i);
    }
    
    const duration = performance.now() - startTime;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Performance check: ${duration.toFixed(2)}ms`;

    if (duration > 100) {
      status = 'unhealthy';
      message += ' - Severe performance degradation';
    } else if (duration > 50) {
      status = 'degraded';
      message += ' - Performance degraded';
    }

    return {
      status,
      message,
      metadata: { computationTime: duration, result: sum }
    };
  }

  private async checkAIService(): Promise<HealthResult> {
    // This is a simple connectivity check without actual API calls
    try {
      // Check if we can reach supabase functions
      const { data } = await supabase.functions.invoke('generate_agent_response', {
        body: { test: true, healthCheck: true }
      });

      return {
        status: 'healthy',
        message: 'AI service connectivity verified'
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: `AI service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async checkRealtimeConnection(): Promise<HealthResult> {
    try {
      const channel = supabase.channel('health_check');
      
      return new Promise<HealthResult>((resolve) => {
        const timeout = setTimeout(() => {
          channel.unsubscribe();
          resolve({
            status: 'degraded',
            message: 'Realtime connection timeout'
          });
        }, 3000);

        channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {})
          .subscribe((status) => {
            clearTimeout(timeout);
            channel.unsubscribe();
            
            if (status === 'SUBSCRIBED') {
              resolve({
                status: 'healthy',
                message: 'Realtime connection established'
              });
            } else {
              resolve({
                status: 'degraded',
                message: `Realtime status: ${status}`
              });
            }
          });
      });
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Realtime error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private calculateSummary(results: Record<string, HealthResult>) {
    const total = Object.keys(results).length;
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let critical_failures = 0;

    for (const [name, result] of Object.entries(results)) {
      switch (result.status) {
        case 'healthy':
          healthy++;
          break;
        case 'degraded':
          degraded++;
          break;
        case 'unhealthy':
          unhealthy++;
          const check = this.checks.get(name);
          if (check?.critical) {
            critical_failures++;
          }
          break;
      }
    }

    return { total, healthy, degraded, unhealthy, critical_failures };
  }

  private determineOverallHealth(
    results: Record<string, HealthResult>,
    summary: ReturnType<typeof this.calculateSummary>
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (summary.critical_failures > 0) return 'unhealthy';
    if (summary.unhealthy > 0 || summary.degraded > summary.healthy) return 'degraded';
    return 'healthy';
  }

  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.monitoringInterval = setInterval(() => {
      this.runHealthCheck().catch(error => {
        logger.error('Health monitoring failed', error as Error);
      });
    }, this.MONITORING_INTERVAL);

    this.isMonitoring = true;
    logger.info('Health monitoring started', { interval: this.MONITORING_INTERVAL });

    // Run initial check
    this.runHealthCheck().catch(error => {
      logger.error('Initial health check failed', error as Error);
    });
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Health monitoring stopped');
  }

  getLastHealthReport(): SystemHealth | null {
    return this.lastHealthReport;
  }

  isHealthy(): boolean {
    return this.lastHealthReport?.overall === 'healthy';
  }

  getHealthSummary(): string {
    if (!this.lastHealthReport) return 'No health data available';
    
    const { overall, summary } = this.lastHealthReport;
    return `System ${overall}: ${summary.healthy}/${summary.total} checks healthy`;
  }
}

export const enhancedHealthMonitor = new EnhancedHealthMonitorService();