import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useServices } from '@/hooks/useServices';
import { useMessageQueue, QueuedMessage } from '@/hooks/useMessageQueue';
import { useMessageQueueRecovery } from '@/hooks/useMessageQueueRecovery';
import type { ChatMessage } from "@/types/index";
import { convertApiMessagesToChatMessages, convertApiMessageToChatMessage } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/use-toast';
import { cacheService } from '@/services/cache.service';
import { useAgentOrchestrationTrigger } from '@/hooks/useAgentOrchestrationTrigger';
import { useRealtimeConnection } from '@/hooks/useRealtimeConnection';

interface OptimizedChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isTyping: boolean;
  error: string | null;
}

export const useOptimizedChat = (deliberationId?: string, messageQueue?: ReturnType<typeof useMessageQueue>) => {
  const { user, isLoading: authLoading } = useSupabaseAuth();
  const { messageService, realtimeService } = useServices();
  const { toast } = useToast();
  
  const [chatState, setChatState] = useState<OptimizedChatState>({
    messages: [],
    isLoading: false,
    isTyping: false,
    error: null
  });
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastLoadedDeliberationRef = useRef<string | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { triggerAgentOrchestration } = useAgentOrchestrationTrigger();
  const realtimeConnection = useRealtimeConnection(deliberationId);
  
  // Initialize recovery system for the queue
  const recovery = messageQueue ? useMessageQueueRecovery(messageQueue) : null;
  
  // Helper to update typing state
  const setTypingState = useCallback((isTyping: boolean) => {
    setChatState(prev => ({ ...prev, isTyping }));
  }, []);
  
  // Optimized message loading with caching
  const loadMessages = useCallback(async () => {
    if (!user || !deliberationId || authLoading) return;
    
    // Skip if already loaded for this deliberation
    if (lastLoadedDeliberationRef.current === deliberationId) return;
    
    setChatState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const data = await cacheService.memoizeAsync(
        'chat-messages',
        [deliberationId, user.id],
        () => messageService.getMessages(deliberationId),
        { ttl: 5000 } // 5 second cache for real-time updates
      );
      
      const convertedMessages = convertApiMessagesToChatMessages(data || []);
      
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
  
  // Optimized real-time subscription
  const setupRealtime = useCallback(() => {
    if (!user || !deliberationId) return;
    
    // Clean up existing subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    try {
      // Real-time message handling with typing state management
      const unsubscribe = realtimeService.subscribeToMessages((message) => {
        // Filter messages for this deliberation
        if (message.deliberation_id !== deliberationId) return;
        
        const chatMessage = convertApiMessageToChatMessage(message);
        
        setChatState(prev => {
          // Check for duplicates - more robust checking
          const exists = prev.messages.some(m => m.id === chatMessage.id);
          if (exists) {
            logger.debug('🔍 Skipping duplicate realtime message', { 
              messageId: chatMessage.id,
              messageType: message.message_type 
            });
            return prev;
          }
          
          logger.debug('📨 Adding realtime message', { 
            messageId: chatMessage.id, 
            type: message.message_type,
            currentCount: prev.messages.length 
          });
          
          // Add new message and sort by timestamp
          const newMessages = [...prev.messages, chatMessage].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          
          return {
            ...prev,
            messages: newMessages,
            // Clear typing indicator when agent message arrives
            isTyping: message.message_type?.includes('agent') ? false : prev.isTyping
          };
        });
        
        // Clear cache when new messages arrive
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
  }, [user, deliberationId, realtimeService]);
  
  // REMOVED: Direct messaging path - all messages must go through queue

  // Main send message function - queue-based messaging only
  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    console.log('🚀 [DEBUG] useOptimizedChat.sendMessage called', {
      content: content.substring(0, 50) + '...',
      mode,
      hasQueue: !!messageQueue,
      queueStats: messageQueue?.getQueueStats
    });
    
    if (!content.trim()) return;
    
    if (!messageQueue) {
      console.error('❌ [DEBUG] Message queue is required for all messaging operations');
      throw new Error('Message queue is required for all messaging operations');
    }
    
    console.log('📋 [DEBUG] Adding message to queue...', { content: content.substring(0, 30) + '...', mode });
    // Add message to queue - this is the only messaging path
    messageQueue.addToQueue(content, undefined, mode);
    console.log('✅ [DEBUG] Message added to queue successfully');
  }, [messageQueue]);

  // Process queued messages
  const processQueuedMessage = useCallback(async (queuedMessage: QueuedMessage) => {
    console.log('🔄 [DEBUG] Starting processQueuedMessage', {
      messageId: queuedMessage.id,
      content: queuedMessage.content.substring(0, 50) + '...',
      mode: queuedMessage.mode,
      hasUser: !!user,
      hasDeliberationId: !!deliberationId
    });
    
    if (!user || !deliberationId || !messageQueue) return;
    
    try {
      logger.info('🚀 Starting message processing', { 
        messageId: queuedMessage.id, 
        content: queuedMessage.content.substring(0, 50) + '...',
        mode: queuedMessage.mode
      });
      
      messageQueue.updateMessageStatus(queuedMessage.id, 'processing');
      setTypingState(true);
      
      console.log('💾 [DEBUG] Saving user message to database...', { messageId: queuedMessage.id });
      logger.info('💾 Saving user message to database', { messageId: queuedMessage.id });
      const saved = await messageService.sendMessage(
        queuedMessage.content,
        'user',
        deliberationId,
        queuedMessage.mode,
        user.id
      );
      
      console.log('✅ [DEBUG] User message saved successfully', { 
        messageId: queuedMessage.id, 
        dbMessageId: saved.id,
        contentLength: saved.content?.length || 0
      });
      
      logger.info('✅ User message saved and verified', { 
        messageId: queuedMessage.id, 
        dbMessageId: saved.id,
        contentLength: saved.content?.length || 0
      });
      
      const userMessage = convertApiMessageToChatMessage(saved);
      
      // Add user message immediately for responsiveness (avoid duplicates)
      setChatState(prev => {
        const exists = prev.messages.some(m => m.id === userMessage.id);
        if (exists) {
          logger.debug('🔍 Skipping duplicate optimistic message', { messageId: userMessage.id });
          return prev;
        }
        
        return {
          ...prev,
          messages: [...prev.messages, userMessage].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
        };
      });
      
      // Clear cache for fresh data
      cacheService.clearNamespace('chat-messages');
      cacheService.clearNamespace('loadMessages');
      
      logger.info('🤖 Triggering agent orchestration', { 
        messageId: queuedMessage.id,
        dbMessageId: saved.id,
        mode: queuedMessage.mode
      });
      
      // Trigger agent orchestration after message is saved and verified
      try {
        await triggerAgentOrchestration(saved.id, deliberationId, queuedMessage.mode, setTypingState);
        
        logger.info('✅ Agent orchestration completed successfully', { 
          messageId: queuedMessage.id,
          dbMessageId: saved.id
        });
        
        // Only mark as completed if orchestration actually succeeded
        messageQueue.updateMessageStatus(queuedMessage.id, 'completed');
        
      } catch (orchestrationError) {
        logger.error('🚨 Agent orchestration failed', orchestrationError as Error, {
          messageId: queuedMessage.id,
          dbMessageId: saved.id
        });
        
        // Mark as failed so it can be retried
        messageQueue.updateMessageStatus(queuedMessage.id, 'failed', 
          orchestrationError instanceof Error ? orchestrationError.message : 'Orchestration failed'
        );
        
        // Don't throw here - let the message stay in queue for retry
        return;
      }
      
      // Force refresh messages after agent response
      setTimeout(() => {
        logger.info('🔄 Force refreshing messages after agent response');
        lastLoadedDeliberationRef.current = null; // Reset to force reload
        loadMessages();
      }, 1000);
      
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      
      logger.error('❌ Message processing failed', { 
        messageId: queuedMessage.id,
        error: errorMsg,
        retries: queuedMessage.retries,
        content: queuedMessage.content.substring(0, 50) + '...'
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
      
      logger.error('Failed to process queued message', error as Error);
    }
  }, [user, deliberationId, messageQueue, messageService, toast, triggerAgentOrchestration, setTypingState]);

  // Event-driven queue processor - triggers when queue changes
  useEffect(() => {
    if (!messageQueue || !user || !deliberationId) return;
    
    const processNextMessage = async () => {
      const stats = messageQueue.getQueueStats;
      const nextMessage = messageQueue.getNextQueuedMessage();
      
      if (!nextMessage || !stats.canProcess) {
        logger.debug('Queue processor: No messages or at capacity', { 
          hasMessage: !!nextMessage, 
          canProcess: stats.canProcess, 
          stats 
        });
        return;
      }

      logger.info('📋 Processing queued message', { 
        messageId: nextMessage.id, 
        queuePosition: nextMessage.queuePosition,
        retries: nextMessage.retries,
        status: nextMessage.status,
        processingCount: stats.processing
      });

      try {
        await processQueuedMessage(nextMessage);
      } catch (error) {
        logger.error('Failed to process message from queue', error as Error);
        messageQueue.updateMessageStatus(nextMessage.id, 'failed', 'Processing failed');
      }
    };
    
    // Trigger immediate processing when queue has items - stabilized
    const stats = messageQueue.getQueueStats;
    if (stats.queued > 0 && stats.canProcess) {
      processNextMessage();
    }
  }, [messageQueue?.queue?.length, messageQueue?.processing?.size, user, deliberationId, processQueuedMessage]);
  
  // Effect for loading messages and setting up real-time
  useEffect(() => {
    if (!authLoading && user && deliberationId) {
      loadMessages();
      setupRealtime();
    }
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user?.id, deliberationId, authLoading, loadMessages, setupRealtime]);
  
  // Cleanup on user change
  useEffect(() => {
    return () => {
      lastLoadedDeliberationRef.current = null;
    };
  }, [user?.id]);

  // Typing state timeout management - prevent stuck typing state
  useEffect(() => {
    if (!chatState.isTyping) return;

    // Maximum typing duration - auto-clear after 30 seconds
    const typingTimeout = setTimeout(() => {
      logger.info('⚠️ Auto-clearing stuck typing indicator after 30 seconds');
      setChatState(prev => ({ ...prev, isTyping: false }));
    }, 30000);

    return () => clearTimeout(typingTimeout);
  }, [chatState.isTyping]);
  
  return {
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
  };
};