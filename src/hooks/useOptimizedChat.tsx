import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useServices } from '@/hooks/useServices';
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

export const useOptimizedChat = (deliberationId?: string) => {
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
  const { triggerAgentOrchestration } = useAgentOrchestrationTrigger();
  
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
  
  // Send message function  
  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
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
      
      logger.info('Message sent successfully', { messageId: saved.id });
      
      // CRITICAL FIX: Trigger agent orchestration after message is saved
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
      
      logger.error('Failed to send message', error as Error);
    }
  }, [user, deliberationId, messageService, toast]);
  
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
    reloadMessages: loadMessages
  };
};