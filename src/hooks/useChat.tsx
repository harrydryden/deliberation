import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useServices } from '@/hooks/useServices';
import type { ChatMessage } from "@/types/index";
import { convertApiMessagesToChatMessages, convertApiMessageToChatMessage } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";
import { useErrorHandler } from './useErrorHandler';
import { useOptimizedState } from './useOptimizedState';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/use-toast';
import { useResponseStreaming } from '@/hooks/useResponseStreaming';
import { cacheService } from '@/services/cache.service';

export const useChat = (deliberationId?: string) => {
  const { user, isLoading: authLoading } = useSupabaseAuth();
  const { messageService, realtimeService } = useServices();
  const { handleError, handleAsyncError } = useErrorHandler();
  
  // Optimized state management to reduce re-renders
  const [chatState, setChatState] = useOptimizedState({
    initialValue: {
      messages: [] as ChatMessage[],
      isLoading: false,
      isTyping: false
    }
  });
  
  // Separate message state updates to prevent unnecessary re-renders of UI state
  const [uiState, setUiState] = useOptimizedState({
    initialValue: {
      isLoading: false,
      isTyping: false
    }
  });
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const { streamingState, startStreaming, stopStreaming } = useResponseStreaming();

  // Memoize services to prevent recreating instances
  const services = useMemo(() => ({
    messageService,
    realtimeService
  }), [messageService, realtimeService]);

  // Stable toast reference to prevent recreating callbacks
  const { toast } = useToast();
  const stableToast = useMemo(() => toast, [toast]);

  // Stable callback references to prevent infinite loops
  const stableLoadChatHistory = useCallback(async () => {
    if (!user) {
      return;
    }

    setUiState(prev => ({ ...prev, isLoading: true }));
    
    await handleAsyncError(async () => {
      const data = await cacheService.memoizeAsync(
        'chat-history',
        [deliberationId, user.id],
        () => {
          return services.messageService.getMessages(deliberationId);
        },
        { ttl: 60000 }
      );
      
      const convertedMessages = convertApiMessagesToChatMessages(data || []);
      
      setChatState(prev => ({ 
        ...prev, 
        messages: convertedMessages
      }));
      setUiState(prev => ({ ...prev, isLoading: false }));
      logger.api.response('GET', '/messages', 200, { deliberationId, messageCount: data?.length || 0 });
    }, 'loading chat history');
  }, [user, deliberationId, handleAsyncError, setChatState, setUiState, services.messageService]);

  const stableSetupRealTimeUpdates = useCallback(() => {
    if (!user) return;

    try {
      const unsubscribe = realtimeService.subscribeToMessages((message) => {
        logger.info('📨 Realtime message received', { 
          id: message.id, 
          type: message.message_type, 
          content: message.content?.substring(0, 50) || '[empty]',
          user_id: message.user_id
        });
        
        const chatMessage: ChatMessage = {
          id: message.id,
          content: message.content,
          message_type: message.message_type as ChatMessage['message_type'],
          created_at: message.created_at,
          user_id: message.user_id,
          submitted_to_ibis: message.submitted_to_ibis || false
        };

          setChatState(prev => {
            // Avoid duplicates
            if (prev.messages.some(msg => msg.id === chatMessage.id)) {
              logger.info('🔄 Duplicate message ignored', { messageId: chatMessage.id });
              return prev;
            }
            logger.info('➕ Adding realtime message', { messageId: chatMessage.id });
            return {
              ...prev,
              messages: [...prev.messages, chatMessage]
            };
          });
          
          // Update typing state separately to prevent message list re-renders
          if (message.message_type && (message.message_type.includes('agent') || message.message_type === 'peer_agent' || message.message_type === 'bill_agent' || message.message_type === 'flow_agent')) {
            setUiState(prev => ({ ...prev, isTyping: false }));
          }
      }, deliberationId);

      unsubscribeRef.current = unsubscribe;
    } catch (error) {
      handleError(error, 'real-time setup');
    }
  }, [user, realtimeService, deliberationId, setChatState, handleError]);

  // Load chat history when user is authenticated or deliberationId changes
  useEffect(() => {
    if (!authLoading && user) {
      // Clear cache to ensure fresh data
      cacheService.clearNamespace('chat-history');
      stableLoadChatHistory();
      stableSetupRealTimeUpdates();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user, authLoading, deliberationId, stableLoadChatHistory, stableSetupRealTimeUpdates]);

  // Remove redundant reload - realtime updates should handle missed messages

  // Listen for agent failure events (e.g., OpenAI quota exceeded)
  useEffect(() => {
    const handler = () => {
      setUiState(prev => ({ ...prev, isTyping: false }));
      stableToast({ title: 'Contact Platform Admin', description: 'AI responses are temporarily unavailable.', variant: 'destructive' });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('agent-error', handler);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('agent-error', handler);
      }
    };
  }, [stableToast, setUiState]);


  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    if (!user || !content.trim()) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      local_id: tempId,
      content: content.trim(),
      message_type: 'user',
      created_at: new Date().toISOString(),
      user_id: user?.id,
      status: 'pending',
    };

    // Optimistic append
    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, optimistic]
    }));
    setUiState(prev => ({ ...prev, isTyping: true }));

    try {
      // const timer = performanceMonitor.startTimer('sendMessage');
      
      // Clear relevant caches when sending new messages
      cacheService.clearNamespace('chat-history');
      
      const saved = await services.messageService.sendMessage(content.trim(), 'user', deliberationId, mode, user?.id);
      const savedChat = convertApiMessageToChatMessage(saved);
      // timer();
      logger.api.response('POST', '/messages', 200, { deliberationId, mode, contentLength: content.length });

      // Replace optimistic with saved
      setChatState(prev => ({
        ...prev,
        messages: prev.messages.map(m => (m.id === tempId ? { ...savedChat, status: 'sent' } : m))
      }));

      // Start streaming the agent response
      if (deliberationId) {
        await startStreaming(
          saved.id,
          deliberationId,
          // onUpdate callback - update streaming message in real-time
          (streamContent: string, agentType: string) => {
            // Only create streaming UI messages when we have actual content to show
            if (!streamContent.trim()) {
              return;
            }
            
            const streamingMessage: ChatMessage = {
              id: `streaming-${saved.id}`,
              content: streamContent,
              message_type: agentType as ChatMessage['message_type'],
              created_at: new Date().toISOString(),
              user_id: 'agent',
              status: 'streaming',
              agent_context: { agentType }
            };

            setChatState(prev => {
              const existingStreamingIndex = prev.messages.findIndex(m => m.id === `streaming-${saved.id}`);
              if (existingStreamingIndex >= 0) {
                // Update existing streaming message
                return {
                  ...prev,
                  messages: prev.messages.map((msg, index) => 
                    index === existingStreamingIndex ? streamingMessage : msg
                  )
                };
              } else {
                // Only add streaming message when we have actual content
                return {
                  ...prev,
                  messages: [...prev.messages, streamingMessage]
                };
              }
            });
          },
          // onComplete callback - replace with final message
          async (finalContent: string, agentType: string) => {
            // Don't create messages with empty content
            if (!finalContent.trim()) {
              setChatState(prev => ({ ...prev, isTyping: false }));
              return;
            }
            
            try {
              // Replace streaming placeholder with final agent message locally to avoid full reload
              const finalMessage: ChatMessage = {
                id: `${saved.id}-final` as string,
                content: finalContent,
                message_type: agentType as ChatMessage['message_type'],
                created_at: new Date().toISOString(),
                user_id: 'agent',
                status: 'sent',
                agent_context: { agentType }
              };

              setChatState(prev => {
                const withoutStreaming = prev.messages.filter(m => m.id !== `streaming-${saved.id}`);
                return {
                  ...prev,
                  messages: [...withoutStreaming, finalMessage],
                  isTyping: false
                };
              });
            } catch (error) {
              logger.error('Error applying final message', { error });
              setUiState(prev => ({ ...prev, isTyping: false }));
            }
          },
          // onError callback
          (error: string) => {
            logger.error('Streaming error', { error });
            // Clean up any streaming messages on error
            setChatState(prev => ({
              ...prev,
              messages: prev.messages.filter(m => m.id !== `streaming-${saved.id}` && !m.id.startsWith('streaming-'))
            }));
            setUiState(prev => ({ ...prev, isTyping: false }));
            stableToast({
              title: "Response Error",
              description: "Failed to get agent response. Please try again.",
              variant: "destructive"
            });
          }
        );
      } else {
        setUiState(prev => ({ ...prev, isTyping: false }));
      }

    } catch (error) {
      const errMsg = getErrorMessage(error);
      setChatState(prev => ({
        ...prev,
        messages: prev.messages.map(m => (m.id === tempId ? { ...m, status: 'failed', error: errMsg } : m))
      }));
      setUiState(prev => ({ ...prev, isTyping: false }));
      throw error;
    }
  }, [user, deliberationId, setChatState, services.messageService, startStreaming, stableToast]);

  const retryMessage = useCallback(async (id: string) => {
    const target = chatState.messages.find(m => m.id === id);
    if (!target || target.status !== 'failed') return;
    // Mark pending
    setChatState(prev => ({
      ...prev,
      messages: prev.messages.map(m => (m.id === id ? { ...m, status: 'pending', error: undefined } : m))
    }));
    try {
      const saved = await services.messageService.sendMessage(target.content, 'user', deliberationId, 'chat', user?.id);
      const savedChat = convertApiMessageToChatMessage(saved);
      setChatState(prev => ({
        ...prev,
        messages: prev.messages.map(m => (m.id === id ? { ...savedChat, status: 'sent' } : m))
      }));
      setUiState(prev => ({ ...prev, isTyping: true }));
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setChatState(prev => ({
        ...prev,
        messages: prev.messages.map(m => (m.id === id ? { ...m, status: 'failed', error: errMsg } : m))
      }));
      setUiState(prev => ({ ...prev, isTyping: false }));
    }
  }, [chatState.messages, deliberationId, setChatState, services.messageService]);

  return {
    messages: chatState.messages,
    isLoading: uiState.isLoading,
    isTyping: uiState.isTyping || streamingState.isStreaming,
    sendMessage,
    loadChatHistory: stableLoadChatHistory,
    retryMessage,
    streamingState,
    stopStreaming
  };
};