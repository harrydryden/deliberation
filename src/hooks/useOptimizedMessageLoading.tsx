// Optimized message loading hook with enhanced caching and performance
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface Message {
  id: string;
  content: string;
  message_type: string;
  user_id: string;
  created_at: string;
  parent_message_id?: string;
  deliberation_id: string;
  agent_context?: any;
}

interface LoadingState {
  messages: Message[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  lastLoadTime: number;
}

// Enhanced message cache with TTL and size limits
class MessageCache {
  private cache = new Map<string, { 
    messages: Message[], 
    timestamp: number, 
    hasMore: boolean,
    totalCount: number 
  }>();
  private readonly TTL = 5 * 1000; // 5 seconds for real-time updates
  private readonly MAX_SIZE = 50;

  get(deliberationId: string, page: number = 0): { messages: Message[], hasMore: boolean, totalCount: number } | null {
    const key = `${deliberationId}_${page}`;
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return {
      messages: entry.messages,
      hasMore: entry.hasMore,
      totalCount: entry.totalCount
    };
  }

  set(deliberationId: string, page: number, messages: Message[], hasMore: boolean, totalCount: number): void {
    const key = `${deliberationId}_${page}`;
    
    // Clean up expired entries
    this.cleanup();
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.MAX_SIZE) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      messages,
      hasMore,
      totalCount,
      timestamp: Date.now()
    });
  }

  invalidate(deliberationId: string): void {
    const keysToDelete = Array.from(this.cache.keys())
      .filter(key => key.startsWith(deliberationId));
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_SIZE,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Global message cache instance
const messageCache = new MessageCache();

export const useOptimizedMessageLoading = (deliberationId: string) => {
  const [state, setState] = useState<LoadingState>({
    messages: [],
    loading: false,
    error: null,
    hasMore: true,
    lastLoadTime: 0
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isLoadingRef = useRef(false);

  // Load messages with enhanced caching and optimizations
  const loadMessages = useCallback(async (page: number = 0, append: boolean = false) => {
    if (isLoadingRef.current && !append) {
      logger.debug('Message loading already in progress, skipping');
      return;
    }

    const startTime = Date.now();
    logger.debug('Loading messages for deliberation', { deliberationId, page });

    // Check cache first
    const cached = messageCache.get(deliberationId, page);
    if (cached && !append) {
      logger.debug('Message cache hit', { deliberationId, page });
      setState(prev => ({
        ...prev,
        messages: cached.messages,
        hasMore: cached.hasMore,
        loading: false,
        error: null,
        lastLoadTime: Date.now()
      }));
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    isLoadingRef.current = true;

    setState(prev => ({
      ...prev,
      loading: true,
      error: null
    }));

    try {
      const MESSAGES_PER_PAGE = 20;
      const offset = page * MESSAGES_PER_PAGE;

      // Optimized query with reduced data transfer
      const { data: messages, error, count } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          message_type,
          user_id,
          created_at,
          parent_message_id,
          deliberation_id,
          agent_context
        `, { count: 'exact' })
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + MESSAGES_PER_PAGE - 1)
        .abortSignal(abortControllerRef.current.signal);

      if (error) {
        throw error;
      }

      const loadTime = Date.now() - startTime;
      const messageCount = messages?.length || 0;
      const totalCount = count || 0;
      const hasMore = totalCount > offset + messageCount;

      logger.debug('GET /messages - 200', {
        deliberationId,
        messageCount,
        totalCount,
        hasMore,
        loadTime: `${loadTime}ms`,
        page
      });

      // Sort messages chronologically for display
      const sortedMessages = messages ? [...messages].reverse() : [];

      // Cache the results
      messageCache.set(deliberationId, page, sortedMessages, hasMore, totalCount);

      setState(prev => ({
        ...prev,
        messages: append ? [...prev.messages, ...sortedMessages] : sortedMessages,
        hasMore,
        loading: false,
        error: null,
        lastLoadTime: Date.now()
      }));

      // Log performance metrics
      logger.info('Message loading completed', {
        deliberationId,
        messageCount,
        loadTime,
        page,
        cached: false
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.debug('Message loading aborted');
        return;
      }

      logger.error('Error loading messages', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load messages';
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));

      logger.error('Message loading failed', error as Error);
    } finally {
      isLoadingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [deliberationId]);

  // Refresh messages (clear cache and reload)
  const refreshMessages = useCallback(() => {
    logger.debug('Refreshing messages for deliberation', { deliberationId });
    messageCache.invalidate(deliberationId);
    loadMessages(0, false);
  }, [deliberationId, loadMessages]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(() => {
    if (state.loading || !state.hasMore) {
      return;
    }

    const currentPage = Math.floor(state.messages.length / 20);
    loadMessages(currentPage, true);
  }, [loadMessages, state.loading, state.hasMore, state.messages.length]);

  // Add new message to state (for real-time updates)
  const addMessage = useCallback((message: Message) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, message]
    }));
    
    // Invalidate cache since we have new data
    messageCache.invalidate(deliberationId);
  }, [deliberationId]);

  // Update existing message in state
  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    }));
    
    // Invalidate cache since we have updated data
    messageCache.invalidate(deliberationId);
  }, [deliberationId]);

  // Initial load
  useEffect(() => {
    if (deliberationId) {
      loadMessages(0, false);
    }
  }, [deliberationId, loadMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    messages: state.messages,
    loading: state.loading,
    error: state.error,
    hasMore: state.hasMore,
    loadMessages,
    refreshMessages,
    loadMoreMessages,
    addMessage,
    updateMessage,
    cacheStats: messageCache.getStats()
  };
};