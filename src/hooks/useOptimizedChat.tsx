import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useServices } from '@/hooks/useServices';
import { useMessageQueue, QueuedMessage } from '@/hooks/useMessageQueue';
import { useMessageQueueRecovery } from '@/hooks/useMessageQueueRecovery';
import type { ChatMessage } from "@/types/index";
import { convertApiMessagesToChatMessages, convertApiMessageToChatMessage } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";
import { logger } from '@/utils/logger';
import { optimizedRealtimeService } from '@/services/optimized-realtime.service';
import { useToast } from '@/hooks/use-toast';
import { cacheService } from '@/services/cache.service';
import { useAgentOrchestrationTrigger } from '@/hooks/useAgentOrchestrationTrigger';
import { useStableRealtimeConnection } from '@/hooks/useStableRealtimeConnection';
import { useMemoryPressureManager } from '@/hooks/useMemoryPressureManager';
import { messageStreamingService } from '@/services/message-streaming.service';
import { LRUCache } from '@/utils/lruCache';

// PERFORMANCE: Optimized state interface with shallow equality support
interface OptimizedChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isTyping: boolean;
  error: string | null;
}

// PERFORMANCE: Request deduplication service
class ChatRequestCache {
  private cache = new Map<string, Promise<any>>();
  private readonly ttl = 5000; // 5 seconds

  async memoizeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as Promise<T>;
    }

    const promise = fn();
    this.cache.set(key, promise);

    // Auto-cleanup after TTL
    setTimeout(() => {
      this.cache.delete(key);
    }, this.ttl);

    return promise;
  }

  clear() {
    this.cache.clear();
  }
}

// Global cache instance for request deduplication
const requestCache = new ChatRequestCache();

export const useOptimizedChat = (deliberationId?: string, messageQueue?: ReturnType<typeof useMessageQueue>) => {
  const { user, isLoading: authLoading } = useSupabaseAuth();
  const { messageService, realtimeService } = useServices();
  const { toast } = useToast();
  
  // PERFORMANCE: Optimized state with batch updates
  const [chatState, setChatState] = useState<OptimizedChatState>({
    messages: [],
    isLoading: false,
    isTyping: false,
    error: null
  });
  
  // PERFORMANCE: Refs for stable callbacks with LRU cache for memory management
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastLoadedDeliberationRef = useRef<string | null>(null);
  const messagesLRURef = useRef(new LRUCache<string, ChatMessage>(100)); // Limit to 100 messages
  const { triggerAgentResponse } = useAgentOrchestrationTrigger();
  const realtimeConnection = useStableRealtimeConnection(deliberationId);
  
  // Memory pressure management
  const memoryManager = useMemoryPressureManager(150); // 150MB threshold
  
  // Initialize recovery system for the queue
  const recovery = messageQueue ? useMessageQueueRecovery(messageQueue) : null;
  
  // PERFORMANCE: Stable typing state updater
  const setTypingState = useCallback((isTyping: boolean) => {
    setChatState(prev => prev.isTyping === isTyping ? prev : { ...prev, isTyping });
  }, []);
  
  // PERFORMANCE: Memoized message sorting function
  const sortMessagesByTime = useCallback((messages: ChatMessage[]) => {
    return messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, []);

  // PERFORMANCE: Optimized message deduplication with LRU cache
  const addMessageOptimized = useCallback((newMessage: ChatMessage) => {
    setChatState(prev => {
      // Use LRU cache for O(1) duplicate checking with memory limits
      const messageLRU = messagesLRURef.current;
      
      if (messageLRU.has(newMessage.id)) {
        return prev; // No change needed
      }

      messageLRU.set(newMessage.id, newMessage);
      
      // Force cleanup if memory pressure detected
      if (messageLRU.needsCleanup()) {
        messageLRU.forceCleanup(50); // Keep only 50 most recent messages
        logger.info('LRU cache cleaned due to memory pressure');
      }
      
      const allMessages = Array.from(messageLRU.keys()).map(id => messageLRU.get(id)!);
      const sortedMessages = sortMessagesByTime(allMessages);

      return {
        ...prev,
        messages: sortedMessages,
        isTyping: newMessage.message_type?.includes('agent') ? false : prev.isTyping
      };
    });
  }, [sortMessagesByTime]);
  
  // PERFORMANCE: Optimized message loading with request deduplication
  const loadMessages = useCallback(async () => {
    if (!user || !deliberationId || authLoading) return;
    
    // Skip if already loaded for this deliberation
    if (lastLoadedDeliberationRef.current === deliberationId) return;
    
    setChatState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const cacheKey = `messages-${deliberationId}-${user.id}`;
      
      const data = await requestCache.memoizeRequest(cacheKey, async () => {
        return await cacheService.memoizeAsync(
          'chat-messages',
          [deliberationId, user.id],
          () => messageService.getMessages(deliberationId),
          { ttl: 5000 }
        );
      });
      
      const convertedMessages = convertApiMessagesToChatMessages(data || []);
      
      // Update LRU cache for fast lookups with memory limits
      messagesLRURef.current.clear();
      convertedMessages.forEach(msg => messagesLRURef.current.set(msg.id, msg));
      
      setChatState(prev => ({ 
        ...prev, 
        messages: convertedMessages,
        isLoading: false,
        error: null
      }));
      
      lastLoadedDeliberationRef.current = deliberationId;
      logger.info('Messages loaded successfully', { 
        deliberationId, 
        messageCount: convertedMessages.length 
      });
      
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      setChatState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: errorMsg 
      }));
      logger.error('Failed to load messages', error as Error);
    }
  }, [user, deliberationId, authLoading, messageService]);
  
  // PERFORMANCE: Optimized real-time subscription with stable handlers
  const setupRealtime = useCallback(() => {
    if (!user || !deliberationId) return;
    
    // Clean up existing subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    try {
      const unsubscribe = optimizedRealtimeService.subscribeToMessages((message) => {
        // Filter messages for this deliberation
        if (message.deliberation_id !== deliberationId) return;
        
        const chatMessage = convertApiMessageToChatMessage(message);
        addMessageOptimized(chatMessage);
        
        // Clear cache when new messages arrive
        requestCache.clear();
        cacheService.clearNamespace('chat-messages');
        
        logger.info('Real-time message received', { 
          messageId: message.id, 
          type: message.message_type 
        });
        
      }, deliberationId);
      
      unsubscribeRef.current = unsubscribe;
      
    } catch (error) {
      logger.error('Failed to setup real-time subscription', error as Error);
    }
  }, [user?.id, deliberationId]); // Stabilized dependencies - removed addMessageOptimized
  
  // PERFORMANCE: Optimized send message function
  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    if (!content.trim() || !messageQueue) {
      if (!messageQueue) {
        logger.error('Message queue is required for all messaging operations');
        throw new Error('Message queue is required for all messaging operations');
      }
      return;
    }
    
    messageQueue.addToQueue(content, undefined, mode);
  }, [messageQueue]);

  // PERFORMANCE: Optimized message processing with better error handling
  const processQueuedMessage = useCallback(async (queuedMessage: QueuedMessage) => {
    if (!user || !deliberationId || !messageQueue) return;
    
    try {
      logger.info('Starting message processing', { 
        messageId: queuedMessage.id, 
        content: queuedMessage.content.substring(0, 50) + '...',
        mode: queuedMessage.mode
      });
      
      messageQueue.updateMessageStatus(queuedMessage.id, 'processing');
      setTypingState(true);
      
      const saved = await messageService.sendMessage(
        queuedMessage.content,
        'user',
        deliberationId,
        queuedMessage.mode,
        user.id
      );
      
      const userMessage = convertApiMessageToChatMessage(saved);
      addMessageOptimized(userMessage);
      
      // Clear cache for fresh data
      requestCache.clear();
      cacheService.clearNamespace('chat-messages');
      cacheService.clearNamespace('loadMessages');
      
      logger.info('Triggering agent orchestration', { 
        messageId: queuedMessage.id,
        dbMessageId: saved.id,
        mode: queuedMessage.mode
      });
      
      // Trigger agent orchestration
      try {
        await triggerAgentResponse(saved.id, deliberationId, undefined, queuedMessage.content, queuedMessage.mode);
        messageQueue.updateMessageStatus(queuedMessage.id, 'completed');
        
      } catch (orchestrationError) {
        logger.error('Agent orchestration failed', orchestrationError as Error);
        messageQueue.updateMessageStatus(queuedMessage.id, 'failed', 
          orchestrationError instanceof Error ? orchestrationError.message : 'Orchestration failed'
        );
        return;
      }
      
      // Force refresh messages after agent response
      setTimeout(() => {
        lastLoadedDeliberationRef.current = null;
        loadMessages();
      }, 1000);
      
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      
      logger.error('Message processing failed', { 
        messageId: queuedMessage.id,
        error: errorMsg,
        retries: queuedMessage.retries
      });
      
      messageQueue.updateMessageStatus(queuedMessage.id, 'failed', errorMsg);
      
      setChatState(prev => ({ 
        ...prev, 
        isTyping: false, 
        error: errorMsg 
      }));
      
      toast({
        title: "Message Processing Error",
        description: `Failed to process message: ${errorMsg}`,
        variant: "destructive"
      });
    }
  }, [user, deliberationId, messageQueue, messageService, toast, triggerAgentResponse, setTypingState, addMessageOptimized, loadMessages]);

  // PERFORMANCE: Optimized queue processor with stable dependencies
  const queueProcessorDeps = useMemo(() => ({
    queueLength: messageQueue?.queue?.length || 0,
    processingSize: messageQueue?.processing?.size || 0,
    hasUser: !!user,
    hasDeliberation: !!deliberationId
  }), [messageQueue?.queue?.length, messageQueue?.processing?.size, user, deliberationId]);

  useEffect(() => {
    if (!messageQueue || !queueProcessorDeps.hasUser || !queueProcessorDeps.hasDeliberation) return;
    
    const processNextMessage = async () => {
      const stats = messageQueue.getQueueStats;
      const nextMessage = messageQueue.getNextQueuedMessage();
      
      if (!nextMessage || !stats.canProcess) return;

      try {
        await processQueuedMessage(nextMessage);
      } catch (error) {
        logger.error('Failed to process message from queue', error as Error);
        messageQueue.updateMessageStatus(nextMessage.id, 'failed', 'Processing failed');
      }
    };
    
    const stats = messageQueue.getQueueStats;
    if (stats.queued > 0 && stats.canProcess) {
      processNextMessage();
    }
  }, [queueProcessorDeps.queueLength, queueProcessorDeps.processingSize, queueProcessorDeps.hasUser, queueProcessorDeps.hasDeliberation, messageQueue, processQueuedMessage]);
  
  // PERFORMANCE: Optimized effect with stable dependencies
  const loadingDeps = useMemo(() => ({
    authLoading,
    userId: user?.id,
    deliberationId
  }), [authLoading, user?.id, deliberationId]);

  useEffect(() => {
    if (!loadingDeps.authLoading && loadingDeps.userId && loadingDeps.deliberationId) {
      loadMessages();
      setupRealtime();
    }
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [loadingDeps.authLoading, loadingDeps.userId, loadingDeps.deliberationId]); // Fixed: Removed function dependencies to prevent loops
  
  // Cleanup on user change and register memory pressure callback
  useEffect(() => {
    // Register cleanup callback for memory pressure
    const unregisterCleanup = memoryManager.registerCleanupCallback(() => {
      logger.info('Memory pressure triggered - cleaning chat state');
      messagesLRURef.current.forceCleanup(25); // Keep only 25 messages under pressure
      requestCache.clear();
      cacheService.clearNamespace('chat-messages');
      messageStreamingService.clearCache(deliberationId);
    });

    return () => {
      lastLoadedDeliberationRef.current = null;
      messagesLRURef.current.clear();
      requestCache.clear();
      unregisterCleanup();
    };
  }, [user?.id, deliberationId, memoryManager]);

  // PERFORMANCE: Auto-clear stuck typing state
  useEffect(() => {
    if (!chatState.isTyping) return;

    const typingTimeout = setTimeout(() => {
      logger.info('Auto-clearing stuck typing indicator');
      setChatState(prev => ({ ...prev, isTyping: false }));
    }, 30000);

    return () => clearTimeout(typingTimeout);
  }, [chatState.isTyping]);
  
  // PERFORMANCE: Memoized return object to prevent unnecessary re-renders
  return useMemo(() => ({
    messages: chatState.messages,
    isLoading: chatState.isLoading,
    isTyping: chatState.isTyping,
    error: chatState.error,
    sendMessage,
    reloadMessages: loadMessages,
    realtimeConnection: realtimeConnection.connectionState,
    forceReconnect: realtimeConnection.forceReconnect,
    recovery: recovery ? {
      getStats: recovery.getRecoveryStats,
      performHealthCheck: recovery.performHealthCheck,
      recoverStuck: recovery.recoverStuckMessages
    } : undefined
  }), [
    chatState.messages, 
    chatState.isLoading, 
    chatState.isTyping, 
    chatState.error,
    sendMessage,
    loadMessages,
    realtimeConnection.connectionState,
    realtimeConnection.forceReconnect,
    recovery
  ]);
};