// Production health monitoring utilities
import { optimizedRealtimeService } from '@/services/optimized-realtime.service';
import { createComponentLogger } from '@/utils/productionLogger';

const logger = createComponentLogger('HealthMonitor');

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  details?: any;
}

class HealthMonitor {
  private checks = new Map<string, HealthCheck>();
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;

  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.runHealthChecks();
    }, intervalMs);

    // Run initial check
    this.runHealthChecks();
    logger.info('Health monitoring started', { intervalMs });
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Health monitoring stopped');
    }
  }

  private async runHealthChecks(): Promise<void> {
    try {
      // Check realtime connections
      await this.checkRealtimeHealth();
      
      // Check network connectivity
      await this.checkNetworkHealth();
      
      // Log overall health status
      this.logHealthSummary();
    } catch (error) {
      logger.error('Error running health checks', error);
    }
  }

  private async checkRealtimeHealth(): Promise<void> {
    try {
      const channelStatus = optimizedRealtimeService.getChannelStatus();
      const channels = Object.keys(channelStatus);
      
      let healthyChannels = 0;
      let degradedChannels = 0;
      
      for (const channelName of channels) {
        const channel = channelStatus[channelName];
        if (channel.isConnected && channel.reconnectAttempts === 0) {
          healthyChannels++;
        } else {
          degradedChannels++;
        }
      }

      const status = degradedChannels === 0 ? 'healthy' : 
                   degradedChannels < channels.length / 2 ? 'degraded' : 'unhealthy';

      this.checks.set('realtime', {
        name: 'Realtime Connections',
        status,
        lastCheck: Date.now(),
        details: {
          totalChannels: channels.length,
          healthyChannels,
          degradedChannels,
          channels: channelStatus
        }
      });
    } catch (error) {
      this.checks.set('realtime', {
        name: 'Realtime Connections',
        status: 'unhealthy',
        lastCheck: Date.now(),
        details: { error: error.message }
      });
    }
  }

  private async checkNetworkHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Simple connectivity test - try to fetch a lightweight endpoint
      const response = await fetch('https://httpbin.org/get', {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      const responseTime = Date.now() - startTime;
      const status = response.ok && responseTime < 2000 ? 'healthy' :
                    response.ok && responseTime < 5000 ? 'degraded' : 'unhealthy';

      this.checks.set('network', {
        name: 'Network Connectivity',
        status,
        lastCheck: Date.now(),
        details: {
          responseTime,
          statusCode: response.status,
          ok: response.ok
        }
      });
    } catch (error) {
      this.checks.set('network', {
        name: 'Network Connectivity', 
        status: 'unhealthy',
        lastCheck: Date.now(),
        details: { error: error.message }
      });
    }
  }

  private logHealthSummary(): void {
    const summary = Array.from(this.checks.values()).reduce((acc, check) => {
      acc[check.status] = (acc[check.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalChecks = this.checks.size;
    const healthyCount = summary.healthy || 0;
    
    if (healthyCount === totalChecks) {
      logger.info('All systems healthy', { summary });
    } else {
      logger.warn('System health degraded', { 
        summary,
        checks: Array.from(this.checks.values())
      });
    }
  }

  getHealthStatus(): { 
    overall: 'healthy' | 'degraded' | 'unhealthy',
    checks: HealthCheck[],
    summary: Record<string, number>
  } {
    const checks = Array.from(this.checks.values());
    const summary = checks.reduce((acc, check) => {
      acc[check.status] = (acc[check.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const unhealthyCount = summary.unhealthy || 0;
    const degradedCount = summary.degraded || 0;
    
    const overall = unhealthyCount > 0 ? 'unhealthy' :
                   degradedCount > 0 ? 'degraded' : 'healthy';

    return { overall, checks, summary };
  }

  // Force health check for debugging
  async forceHealthCheck(): Promise<void> {
    await this.runHealthChecks();
  }
}

// Export singleton instance
export const healthMonitor = new HealthMonitor();

// Auto-start monitoring in development mode
if (process.env.NODE_ENV !== 'production') {
  healthMonitor.startMonitoring(30000); // 30 seconds in development
}