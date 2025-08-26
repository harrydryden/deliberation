// Optimized message loading hook with batching and pagination
import { useState, useCallback, useRef, useEffect } from 'react';
import { useServices } from '@/hooks/useServices';
import { cacheService } from '@/services/cache.service';
import { performanceMonitor } from '@/utils/performanceUtils';
import { logger } from '@/utils/logger';
import type { Message } from '@/types/index';

interface UseOptimizedMessageLoadingOptions {
  deliberationId?: string;
  pageSize?: number;
  enablePagination?: boolean;
  cacheTimeout?: number;
}

export const useOptimizedMessageLoading = (options: UseOptimizedMessageLoadingOptions = {}) => {
  const { 
    deliberationId, 
    pageSize = 50, 
    enablePagination = true,
    cacheTimeout = 300000 // 5 minutes
  } = options;

  const { messageService } = useServices();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentPageRef = useRef(0);
  const totalLoadedRef = useRef(0);

  // Batch load messages with pagination
  const loadMessages = useCallback(async (page = 0, append = false) => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const timer = performanceMonitor.startTimer('loadMessages');

      // Use caching for message requests
      const cacheKey = enablePagination 
        ? `messages-${deliberationId}-${page}-${pageSize}`
        : `messages-${deliberationId}`;

      const loadFunction = enablePagination 
        ? () => messageService.getMessagesPaginated(deliberationId, page, pageSize)
        : () => messageService.getMessages(deliberationId);

      const data = await cacheService.memoizeAsync(
        'messages',
        [cacheKey],
        loadFunction,
        { ttl: cacheTimeout }
      );

      if (append) {
        setMessages(prev => [...prev, ...(data || [])]);
      } else {
        setMessages(data || []);
      }

      // Update pagination state
      if (enablePagination) {
        const newTotal = totalLoadedRef.current + (data?.length || 0);
        totalLoadedRef.current = newTotal;
        setHasMore((data?.length || 0) >= pageSize);
        currentPageRef.current = page;
      }

      timer();
      logger.performance.mark('Messages loaded', { 
        page, 
        count: data?.length || 0,
        deliberationId,
        cached: true 
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load messages';
      setError(errorMessage);
      logger.error('Failed to load messages', err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [deliberationId, pageSize, enablePagination, cacheTimeout, messageService, isLoading]);

  // Load next page
  const loadMore = useCallback(() => {
    if (hasMore && !isLoading && enablePagination) {
      loadMessages(currentPageRef.current + 1, true);
    }
  }, [hasMore, isLoading, enablePagination, loadMessages]);

  // Refresh messages (clear cache and reload)
  const refresh = useCallback(() => {
    cacheService.clearNamespace('messages');
    currentPageRef.current = 0;
    totalLoadedRef.current = 0;
    setHasMore(true);
    loadMessages(0, false);
  }, [loadMessages]);

  // Initial load
  useEffect(() => {
    if (deliberationId) {
      loadMessages(0, false);
    }
  }, [deliberationId, loadMessages]);

  return {
    messages,
    isLoading,
    hasMore,
    error,
    loadMore,
    refresh,
    totalLoaded: totalLoadedRef.current
  };
};

// Extension to MessageService for pagination (would need to be implemented)
declare module '@/services/domain/implementations/message.service' {
  interface MessageService {
    getMessagesPaginated(deliberationId?: string, page?: number, limit?: number): Promise<Message[]>;
  }
}