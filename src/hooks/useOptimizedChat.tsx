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
        { ttl: 30000 } // 30 second cache
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
          // Check for duplicates
          const exists = prev.messages.some(m => m.id === chatMessage.id);
          if (exists) return prev;
          
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
  
  // Legacy direct send message (fallback when no queue provided)
  const sendMessageDirect = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    if (!user || !deliberationId || !content.trim()) return;
    
    setChatState(prev => ({ ...prev, isTyping: true, error: null }));
    
    try {
      const saved = await messageService.sendMessage(
        content.trim(),
        'user',
        deliberationId,
        mode,
        user.id
      );
      
      const userMessage = convertApiMessageToChatMessage(saved);
      
      // Add user message immediately for responsiveness
      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, userMessage].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      }));
      
      // Clear cache
      cacheService.clearNamespace('chat-messages');
      
      logger.info('Message sent successfully (direct)', { messageId: saved.id });
      
      // Trigger agent orchestration after message is saved
      await triggerAgentOrchestration(saved.id, deliberationId, mode, setTypingState);
      
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      setChatState(prev => ({ 
        ...prev, 
        isTyping: false, 
        error: errorMsg 
      }));
      
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive"
      });
      
      logger.error('Failed to send message (direct)', error as Error);
    }
  }, [user, deliberationId, messageService, toast, triggerAgentOrchestration, setTypingState]);

  // Main send message function - REMOVED queue logic to prevent double processing
  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    if (!content.trim()) return;
    
    // Queue handling is now done in DeliberationChat only
    // This is a fallback for direct use without queue
    if (!messageQueue) {
      await sendMessageDirect(content, mode);
    }
  }, [messageQueue, sendMessageDirect]);

  // Process queued messages
  const processQueuedMessage = useCallback(async (queuedMessage: QueuedMessage) => {
    if (!user || !deliberationId || !messageQueue) return;
    
    try {
      messageQueue.updateMessageStatus(queuedMessage.id, 'processing');
      setTypingState(true);
      
      // Send the message using the existing service
      const saved = await messageService.sendMessage(
        queuedMessage.content,
        'user',
        deliberationId,
        queuedMessage.mode,
        user.id
      );
      
      const userMessage = convertApiMessageToChatMessage(saved);
      
      // Add user message immediately for responsiveness
      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, userMessage].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      }));
      
      // Clear cache
      cacheService.clearNamespace('chat-messages');
      
      // Update queue status to completed
      messageQueue.updateMessageStatus(queuedMessage.id, 'completed');
      
      logger.info('Message sent successfully from queue', { 
        messageId: saved.id,
        queueId: queuedMessage.id 
      });
      
      // Trigger agent orchestration after message is saved
      await triggerAgentOrchestration(saved.id, deliberationId, queuedMessage.mode, setTypingState);
      
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      messageQueue.updateMessageStatus(queuedMessage.id, 'failed', errorMsg);
      
      setChatState(prev => ({ 
        ...prev, 
        isTyping: false, 
        error: errorMsg 
      }));
      
      // Enhanced error logging with retry info
      logger.error('Failed to send queued message', error as Error, {
        queueId: queuedMessage.id.substring(0, 8),
        retries: queuedMessage.retries,
        canRetry: queuedMessage.retries < 2
      });
      
      // Only show toast for final failures
      if (queuedMessage.retries >= 1) {
        toast({
          title: "Message Failed",
          description: "Message failed to send after retries. Check queue status for details.",
          variant: "destructive"
        });
      }
    }
  }, [user, deliberationId, messageQueue, messageService, toast, triggerAgentOrchestration, setTypingState]);

  // Queue processor - processes one message at a time
  useEffect(() => {
    if (!messageQueue || !user || !deliberationId) return;
    
    const processNextMessage = async () => {
      const nextMessage = messageQueue.getNextQueuedMessage();
      // CRITICAL FIX: Check if can process using queue stats
      if (nextMessage) {
        const stats = messageQueue.getQueueStats;
        if (stats.canProcess) {
          await processQueuedMessage(nextMessage);
        }
      }
    };
    
    // Process queue every 100ms when there are queued messages
    const queueInterval = setInterval(() => {
      const stats = messageQueue.getQueueStats;
      if (stats.queued > 0 && stats.canProcess) {
        processNextMessage();
      }
    }, 100);
    
    return () => clearInterval(queueInterval);
  }, [messageQueue, user, deliberationId, processQueuedMessage]);
  
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
  
  return {
    messages: chatState.messages,
    isLoading: chatState.isLoading,
    isTyping: chatState.isTyping,
    error: chatState.error,
    sendMessage,
    reloadMessages: loadMessages,
    recovery: recovery ? {
      getStats: recovery.getRecoveryStats,
      performHealthCheck: recovery.performHealthCheck,
      recoverStuck: recovery.recoverStuckMessages
    } : undefined
  };
};