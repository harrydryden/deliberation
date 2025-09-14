/**
 * Message Streaming Service for handling large deliberations efficiently
 */
import { supabase } from '@/integrations/supabase/client';
import { convertApiMessagesToChatMessages } from '@/utils/chat';
import type { ChatMessage } from '@/types/index';
import { LRUCache } from '@/utils/lruCache';
import { logger } from '@/utils/logger';

interface StreamingConfig {
  pageSize: number;
  maxCachedPages: number;
  prefetchThreshold: number;
}

interface MessagePage {
  messages: ChatMessage[];
  cursor: string | null;
  hasMore: boolean;
  pageIndex: number;
}

export class MessageStreamingService {
  private pageCache = new LRUCache<string, MessagePage>(10); // Cache up to 10 pages
  private config: StreamingConfig = {
    pageSize: 25, // Load 25 messages at a time
    maxCachedPages: 5, // Keep max 5 pages in memory = 125 messages
    prefetchThreshold: 5 // Prefetch when 5 messages from end
  };

  async loadInitialMessages(deliberationId: string): Promise<{
    messages: ChatMessage[];
    hasMore: boolean;
    totalCount: number;
  }> {
    try {
      // Load last 50 messages (2 pages) initially
      const { data: recentMessages, count } = await supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!recentMessages) {
        return { messages: [], hasMore: false, totalCount: 0 };
      }

      // Reverse to get chronological order
      const chronologicalMessages = recentMessages.reverse();
      const convertedMessages = convertApiMessagesToChatMessages(chronologicalMessages);
      
      // Cache first page
      const pageKey = this.getPageKey(deliberationId, 0);
      this.pageCache.set(pageKey, {
        messages: convertedMessages.slice(-25), // Last 25 messages
        cursor: recentMessages[0]?.id || null,
        hasMore: (count || 0) > 50,
        pageIndex: 0
      });

      logger.info('Initial messages loaded', { 
        deliberationId, 
        messageCount: convertedMessages.length,
        totalCount: count || 0,
        hasMore: (count || 0) > 50
      });

      return {
        messages: convertedMessages,
        hasMore: (count || 0) > 50,
        totalCount: count || 0
      };
    } catch (error) {
      logger.error('Failed to load initial messages', error as Error);
      throw error;
    }
  }

  async loadMoreMessages(deliberationId: string, currentCount: number): Promise<{
    messages: ChatMessage[];
    hasMore: boolean;
  }> {
    try {
      const pageIndex = Math.floor(currentCount / this.config.pageSize);
      const pageKey = this.getPageKey(deliberationId, pageIndex);

      // Check cache first
      if (this.pageCache.has(pageKey)) {
        const cachedPage = this.pageCache.get(pageKey)!;
        return {
          messages: cachedPage.messages,
          hasMore: cachedPage.hasMore
        };
      }

      // Load from database
      const offset = currentCount;
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true })
        .range(offset, offset + this.config.pageSize - 1);

      if (!messages) {
        return { messages: [], hasMore: false };
      }

      const convertedMessages = convertApiMessagesToChatMessages(messages);
      const hasMore = messages.length === this.config.pageSize;

      // Cache the page
      this.pageCache.set(pageKey, {
        messages: convertedMessages,
        cursor: messages[messages.length - 1]?.id || null,
        hasMore,
        pageIndex
      });

      // Cleanup old pages if memory pressure
      if (this.pageCache.needsCleanup()) {
        this.pageCache.forceCleanup();
      }

      logger.info('More messages loaded', { 
        deliberationId,
        pageIndex,
        messageCount: convertedMessages.length,
        hasMore
      });

      return {
        messages: convertedMessages,
        hasMore
      };
    } catch (error) {
      logger.error('Failed to load more messages', error as Error);
      throw error;
    }
  }

  async prefetchNextPage(deliberationId: string, currentCount: number): Promise<void> {
    try {
      const nextPageIndex = Math.floor(currentCount / this.config.pageSize) + 1;
      const pageKey = this.getPageKey(deliberationId, nextPageIndex);

      // Don't prefetch if already cached
      if (this.pageCache.has(pageKey)) {
        return;
      }

      // Background prefetch
      this.loadMoreMessages(deliberationId, nextPageIndex * this.config.pageSize);
    } catch (error) {
      // Ignore prefetch errors
      logger.warn('Prefetch failed', { deliberationId, error });
    }
  }

  private getPageKey(deliberationId: string, pageIndex: number): string {
    return `${deliberationId}-page-${pageIndex}`;
  }

  clearCache(deliberationId?: string): void {
    if (deliberationId) {
      // Clear specific deliberation
      for (let i = 0; i < 20; i++) {
        const pageKey = this.getPageKey(deliberationId, i);
        this.pageCache.delete(pageKey);
      }
    } else {
      // Clear all
      this.pageCache.clear();
    }
  }

  getStats() {
    return {
      ...this.pageCache.getStats(),
      config: this.config
    };
  }
}

// Export singleton instance
export const messageStreamingService = new MessageStreamingService();