import { logger } from './logger';

export interface StreamHealthMetrics {
  connectionId: string;
  startTime: number;
  lastActivity: number;
  bytesReceived: number;
  chunksReceived: number;
  isHealthy: boolean;
  disconnections: number;
}

export class StreamHealthMonitor {
  private connections = new Map<string, StreamHealthMetrics>();
  private readonly STALE_CONNECTION_TIMEOUT = 30000; // 30 seconds
  private readonly HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
  private healthCheckTimer?: NodeJS.Timeout;

  constructor() {
    this.startHealthChecking();
  }

  startConnection(messageId: string): string {
    const connectionId = `stream_${messageId}_${Date.now()}`;
    const metrics: StreamHealthMetrics = {
      connectionId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      bytesReceived: 0,
      chunksReceived: 0,
      isHealthy: true,
      disconnections: 0
    };

    this.connections.set(connectionId, metrics);
    
    logger.info('🌊 Stream connection started', {
      connectionId,
      messageId,
      timestamp: new Date().toISOString()
    });

    return connectionId;
  }

  recordActivity(connectionId: string, bytesReceived: number = 0): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) return;

    const now = Date.now();
    metrics.lastActivity = now;
    metrics.bytesReceived += bytesReceived;
    metrics.chunksReceived += 1;
    metrics.isHealthy = true;

    logger.debug('📊 Stream activity recorded', {
      connectionId,
      bytesReceived,
      totalBytes: metrics.bytesReceived,
      totalChunks: metrics.chunksReceived,
      duration: now - metrics.startTime
    });
  }

  recordDisconnection(connectionId: string, reason?: string): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) return;

    metrics.disconnections += 1;
    metrics.isHealthy = false;

    logger.warn('🔌 Stream disconnection recorded', {
      connectionId,
      reason,
      disconnectionCount: metrics.disconnections,
      duration: Date.now() - metrics.startTime,
      bytesReceived: metrics.bytesReceived
    });
  }

  endConnection(connectionId: string, reason: 'complete' | 'error' | 'timeout' = 'complete'): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) return;

    const duration = Date.now() - metrics.startTime;
    
    logger.info('🏁 Stream connection ended', {
      connectionId,
      reason,
      duration,
      bytesReceived: metrics.bytesReceived,
      chunksReceived: metrics.chunksReceived,
      disconnections: metrics.disconnections,
      wasHealthy: metrics.isHealthy
    });

    this.connections.delete(connectionId);
  }

  getConnectionHealth(connectionId: string): StreamHealthMetrics | null {
    return this.connections.get(connectionId) || null;
  }

  getAllConnections(): StreamHealthMetrics[] {
    return Array.from(this.connections.values());
  }

  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private performHealthCheck(): void {
    const now = Date.now();
    const staleConnections: string[] = [];

    for (const [connectionId, metrics] of this.connections) {
      const timeSinceActivity = now - metrics.lastActivity;
      
      if (timeSinceActivity > this.STALE_CONNECTION_TIMEOUT) {
        staleConnections.push(connectionId);
        metrics.isHealthy = false;
      }
    }

    if (staleConnections.length > 0) {
      logger.warn('⚕️ Stale stream connections detected', {
        staleCount: staleConnections.length,
        totalConnections: this.connections.size,
        staleConnections
      });
    }

    // Log health summary every minute
    if (Date.now() % 60000 < this.HEALTH_CHECK_INTERVAL) {
      this.logHealthSummary();
    }
  }

  private logHealthSummary(): void {
    const connections = Array.from(this.connections.values());
    const healthyConnections = connections.filter(c => c.isHealthy).length;
    const totalBytes = connections.reduce((sum, c) => sum + c.bytesReceived, 0);
    const totalChunks = connections.reduce((sum, c) => sum + c.chunksReceived, 0);

    logger.info('📊 Stream health summary', {
      totalConnections: connections.length,
      healthyConnections,
      unhealthyConnections: connections.length - healthyConnections,
      totalBytesReceived: totalBytes,
      totalChunksReceived: totalChunks,
      averageBytesPerConnection: connections.length ? Math.round(totalBytes / connections.length) : 0
    });
  }

  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    this.connections.clear();
  }
}

// Singleton instance for global use
export const streamHealthMonitor = new StreamHealthMonitor();