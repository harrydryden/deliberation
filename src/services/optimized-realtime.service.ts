// Optimized realtime service with intelligent reconnection management
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/utils/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

const logger = createLogger('OptimizedRealtimeService');

interface ConnectionConfig {
  maxReconnectAttempts: number;
  baseDelay: number;
  maxDelay: number;
  jitterRange: number;
}

interface ChannelManager {
  channel: RealtimeChannel;
  isConnected: boolean;
  reconnectAttempts: number;
  lastConnectTime: number;
  subscriptionCount: number;
}

class OptimizedRealtimeService {
  private channels = new Map<string, ChannelManager>();
  private config: ConnectionConfig = {
    maxReconnectAttempts: 2, // Reduced to minimize connection storms
    baseDelay: 2000, // Faster initial reconnection
    maxDelay: 30000, // Reduced max delay for faster recovery
    jitterRange: 0.3 // Increased jitter to spread reconnections
  };

  private getOrCreateChannel(channelName: string): ChannelManager {
    if (!this.channels.has(channelName)) {
      const channel = supabase.channel(channelName);
      
      const manager: ChannelManager = {
        channel,
        isConnected: false,
        reconnectAttempts: 0,
        lastConnectTime: 0,
        subscriptionCount: 0
      };

      // Set up connection event handlers
      channel.on('system', { event: '*' }, (payload) => {
        this.handleSystemEvent(channelName, payload);
      });

      this.channels.set(channelName, manager);
      logger.debug('Created new channel', { channelName });
    }

    return this.channels.get(channelName)!;
  }

  private handleSystemEvent(channelName: string, payload: any) {
    const manager = this.channels.get(channelName);
    if (!manager) return;

    switch (payload.event) {
      case 'SYSTEM':
        if (payload.message === 'Subscribed to PostgreSQL') {
          manager.isConnected = true;
          manager.reconnectAttempts = 0;
          manager.lastConnectTime = Date.now();
          logger.debug('Channel connected successfully', { channelName });
        }
        break;
      
      case 'CLOSE':
        manager.isConnected = false;
        logger.warn('Channel closed', { channelName, payload });
        // Add debouncing - only reconnect if we haven't tried recently
        if (manager.reconnectAttempts < this.config.maxReconnectAttempts) {
          setTimeout(() => this.scheduleReconnect(channelName), 2000);
        }
        break;
        
      case 'ERROR':
        manager.isConnected = false;
        logger.error('Channel error', { channelName, error: payload });
        // Debounce error-triggered reconnections more aggressively
        if (manager.reconnectAttempts < this.config.maxReconnectAttempts) {
          setTimeout(() => this.scheduleReconnect(channelName), 3000);
        } else {
          logger.warn('Max reconnection attempts reached for channel', { channelName });
        }
        break;
    }
  }

  private scheduleReconnect(channelName: string) {
    const manager = this.channels.get(channelName);
    if (!manager || manager.subscriptionCount === 0) return;

    if (manager.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached', { 
        channelName, 
        attempts: manager.reconnectAttempts 
      });
      return;
    }

    const delay = this.calculateBackoff(manager.reconnectAttempts);
    manager.reconnectAttempts++;

    logger.info('Scheduling reconnect', { 
      channelName, 
      attempt: manager.reconnectAttempts,
      delayMs: delay 
    });

    setTimeout(() => {
      this.reconnectChannel(channelName);
    }, delay);
  }

  private calculateBackoff(attempt: number): number {
    const exponentialDelay = Math.min(
      this.config.baseDelay * Math.pow(2, attempt),
      this.config.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.config.jitterRange * Math.random();
    return exponentialDelay + jitter;
  }

  private async reconnectChannel(channelName: string) {
    const manager = this.channels.get(channelName);
    if (!manager || manager.isConnected) return;

    try {
      // Unsubscribe old channel
      supabase.removeChannel(manager.channel);
      
      // Create new channel and update manager
      const newChannel = supabase.channel(channelName);
      manager.channel = newChannel;
      
      // Re-establish system event handlers
      newChannel.on('system', { event: '*' }, (payload) => {
        this.handleSystemEvent(channelName, payload);
      });

      // Resubscribe (will be handled by existing subscriptions)
      await newChannel.subscribe();
      
      logger.info('Channel reconnected', { channelName });
    } catch (error) {
      logger.error('Reconnection failed', { channelName, error });
      this.scheduleReconnect(channelName);
    }
  }

  subscribeToMessages(
    callback: (message: any) => void,
    deliberationId?: string
  ): () => void {
    // OPTIMIZATION: Use single shared channel for all message subscriptions
    const channelName = `messages-shared`;
    const manager = this.getOrCreateChannel(channelName);
    
    manager.subscriptionCount++;
    
    // Debounced callback to reduce update frequency
    const debouncedCallback = this.createDebouncedCallback(callback, 100);
    
    const subscription = manager.channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
          // No filter - we'll filter client-side for better connection sharing
        },
        (payload) => {
          if (payload.new) {
            // Client-side filtering for deliberationId
            if (!deliberationId || payload.new.deliberation_id === deliberationId) {
              debouncedCallback(payload.new);
            }
          }
        }
      );

    // Subscribe if not already connected
    if (!manager.isConnected && manager.subscriptionCount === 1) {
      manager.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          manager.isConnected = true;
          manager.lastConnectTime = Date.now();
          logger.debug('Shared message channel connected', { channelName });
        }
      });
    }

    // Return cleanup function
    return () => {
      manager.subscriptionCount = Math.max(0, manager.subscriptionCount - 1);
      
      // Only cleanup if no more subscribers (keep shared channel alive longer)
      if (manager.subscriptionCount === 0) {
        // Add delay before cleanup to allow reconnection
        setTimeout(() => {
          const currentManager = this.channels.get(channelName);
          if (currentManager && currentManager.subscriptionCount === 0) {
            supabase.removeChannel(manager.channel);
            this.channels.delete(channelName);
            logger.debug('Shared channel cleaned up after delay', { channelName });
          }
        }, 5000);
      }
    };
  }

  private debouncedCallbacks = new Map<Function, { timeout: NodeJS.Timeout | null; pending: any[] }>();

  private createDebouncedCallback(callback: Function, delay: number) {
    return (data: any) => {
      if (!this.debouncedCallbacks.has(callback)) {
        this.debouncedCallbacks.set(callback, { timeout: null, pending: [] });
      }
      
      const debounceData = this.debouncedCallbacks.get(callback)!;
      debounceData.pending.push(data);
      
      if (debounceData.timeout) {
        clearTimeout(debounceData.timeout);
      }
      
      debounceData.timeout = setTimeout(() => {
        const messages = debounceData.pending.splice(0);
        messages.forEach(msg => callback(msg));
        debounceData.timeout = null;
      }, delay);
    };
  }

  subscribeToDeliberations(callback: (deliberation: any) => void): () => void {
    const channelName = 'deliberations-changes';
    const manager = this.getOrCreateChannel(channelName);
    
    manager.subscriptionCount++;
    
    manager.channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliberations'
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new);
          }
        }
      );

    if (!manager.isConnected && manager.subscriptionCount === 1) {
      manager.channel.subscribe();
    }

    return () => {
      manager.subscriptionCount = Math.max(0, manager.subscriptionCount - 1);
      
      if (manager.subscriptionCount === 0) {
        supabase.removeChannel(manager.channel);
        this.channels.delete(channelName);
      }
    };
  }

  subscribeToAgentInteractions(
    callback: (interaction: any) => void,
    deliberationId?: string
  ): () => void {
    const channelName = `agent-interactions-${deliberationId || 'global'}`;
    const manager = this.getOrCreateChannel(channelName);
    
    manager.subscriptionCount++;
    
    manager.channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: deliberationId ? `deliberation_id=eq.${deliberationId}` : undefined
        },
        (payload) => {
          if (payload.new && payload.new.message_type?.endsWith('_agent')) {
            callback(payload.new);
          }
        }
      );

    if (!manager.isConnected && manager.subscriptionCount === 1) {
      manager.channel.subscribe();
    }

    return () => {
      manager.subscriptionCount = Math.max(0, manager.subscriptionCount - 1);
      
      if (manager.subscriptionCount === 0) {
        supabase.removeChannel(manager.channel);
        this.channels.delete(channelName);
      }
    };
  }

  // Health monitoring
  getChannelStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    this.channels.forEach((manager, channelName) => {
      status[channelName] = {
        isConnected: manager.isConnected,
        subscriptionCount: manager.subscriptionCount,
        reconnectAttempts: manager.reconnectAttempts,
        lastConnectTime: manager.lastConnectTime,
        uptime: manager.lastConnectTime ? Date.now() - manager.lastConnectTime : 0
      };
    });
    
    return status;
  }

  // Force reconnect all channels (useful for debugging)
  forceReconnectAll(): void {
    logger.info('Force reconnecting all channels');
    
    this.channels.forEach((manager, channelName) => {
      if (manager.subscriptionCount > 0) {
        manager.isConnected = false;
        manager.reconnectAttempts = 0;
        this.reconnectChannel(channelName);
      }
    });
  }
}

// Export singleton instance
export const optimizedRealtimeService = new OptimizedRealtimeService();