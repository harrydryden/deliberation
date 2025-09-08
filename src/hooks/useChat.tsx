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
import { useOptimizedMessageCleanup } from '@/hooks/useOptimizedMessageCleanup';
import { useMessageQueue } from '@/hooks/useMessageQueue';

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
  
  // F002 Fix: Initialize message cleanup handler
  const { 
    scheduleFailedMessageCleanup, 
    cancelCleanup, 
    cancelAllCleanups
  } = useOptimizedMessageCleanup();

  // Initialize message queue with max 5 concurrent messages
  const messageQueue = useMessageQueue(5);

  // Memoize services to prevent recreating instances
  const services = useMemo(() => ({
    messageService,
    realtimeService
  }), [messageService, realtimeService]);

  // Stable toast reference to prevent recreating callbacks
  const { toast } = useToast();
  const stableToast = useMemo(() => toast, [toast]);

  // F005 Fix: Simplified and memoized message sorting function
  const sortMessagesByOrder = useCallback((messages: ChatMessage[]): ChatMessage[] => {
    return [...messages].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      
      // If message B is a direct response to message A, B should follow A
      if (b.parent_message_id === a.id) return -1;
      if (a.parent_message_id === b.id) return 1;
      
      // For same-parent messages, maintain chronological order
      if (a.parent_message_id === b.parent_message_id) return timeA - timeB;
      
      // Default chronological sort
      return timeA - timeB;
    });
  }, []);

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
          
          // F002 Fix: Filter out messages scheduled for cleanup - simplified approach
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

  // F006 Fix: Optimize cache clearing - only clear on user change, not on every load
  const currentUserIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!authLoading && user) {
      // Only clear cache when user changes, not on every load
      if (user.id !== currentUserIdRef.current) {
        cacheService.clearNamespace('chat-history');
        currentUserIdRef.current = user.id;
      }
      stableLoadChatHistory();
      stableSetupRealTimeUpdates();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      // F002 Fix: Cleanup scheduled message cleanups on unmount
      cancelAllCleanups();
    };
  }, [user, authLoading, deliberationId, stableLoadChatHistory, stableSetupRealTimeUpdates, cancelAllCleanups]);

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


  const processQueuedMessage = useCallback(async (queuedMessage: any) => {
    if (!user || !deliberationId) return;

    const { id: queueId, content, parentMessageId } = queuedMessage;
    
    console.log('🔥 Starting to process queued message:', { 
      queueId, 
      content: content.substring(0, 50),
      timestamp: new Date().toISOString()
    });
    
    try {
      // Update status to processing ONLY when we actually start processing
      messageQueue.updateMessageStatus(queueId, 'processing');
      
      console.log('📤 Sending message to service...', { queueId });
      
  // F006 Fix: Selective cache invalidation - only clear when sending new messages
  const clearRelevantCache = useCallback(() => {
    // Only clear chat history cache, preserve other caches for better performance
    cacheService.clearNamespace('chat-history');
  }, []);
      
      const saved = await services.messageService.sendMessage(
        content.trim(), 
        'user', 
        deliberationId, 
        'chat', 
        user?.id
      );
      
      console.log('✅ Message saved to database:', { 
        queueId, 
        savedMessageId: saved.id,
        timestamp: new Date().toISOString()
      });
      
      const savedChat = convertApiMessageToChatMessage(saved);
      
      // Add user message to chat with parent_message_id if specified
      const userMessage: ChatMessage = {
        ...savedChat,
        status: 'sent',
        parent_message_id: parentMessageId
      };
      
      setChatState(prev => {
  // F005 Fix: Simplified and memoized message sorting function
  const sortMessagesByOrder = useCallback((messages: ChatMessage[]): ChatMessage[] => {
    return [...messages].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      
      // If message B is a direct response to message A, B should follow A
      if (b.parent_message_id === a.id) return -1;
      if (a.parent_message_id === b.id) return 1;
      
      // For same-parent messages, maintain chronological order
      if (a.parent_message_id === b.parent_message_id) return timeA - timeB;
      
      // Default chronological sort
      return timeA - timeB;
    });
  }, []);
        
        return {
          ...prev,
          messages: sortMessagesByOrder([...prev.messages, userMessage])
        };
      });

      logger.api.response('POST', '/messages', 200, { 
        deliberationId, 
        mode: 'chat', 
        contentLength: content.length,
        queueId,
        parentMessageId
      });

      // Start streaming the agent response
      console.log('🚀 About to start streaming agent response for queued message', { 
        messageId: saved.id,
        queueId,
        deliberationId, 
        hasStartStreamingFn: !!startStreaming,
        timestamp: new Date().toISOString()
      });
      
      await startStreaming(
        saved.id,
        deliberationId,
        // onUpdate callback
        (streamContent: string, messageId: string, agentType: string | null) => {
          if (!streamContent.trim()) return;
          
          console.log('📡 Streaming update received:', { 
            queueId, 
            messageId, 
            contentLength: streamContent.length,
            agentType 
          });
          
          const streamingMessage: ChatMessage = {
            id: `streaming-${saved.id}`,
            content: streamContent,
            message_type: agentType as ChatMessage['message_type'],
            created_at: new Date().toISOString(),
            user_id: 'agent',
            status: 'streaming',
            agent_context: { agentType },
            parent_message_id: saved.id // Agent response is child of user message
          };

          setChatState(prev => {
            const existingStreamingIndex = prev.messages.findIndex(m => m.id === `streaming-${saved.id}`);
            let updatedMessages;
            
            if (existingStreamingIndex >= 0) {
              updatedMessages = prev.messages.map((msg, index) => 
                index === existingStreamingIndex ? streamingMessage : msg
              );
            } else {
              updatedMessages = [...prev.messages, streamingMessage];
            }
            
            return {
              ...prev,
              messages: sortMessagesByOrder(
                existingStreamingIndex >= 0
                  ? prev.messages.map((msg, index) => 
                      index === existingStreamingIndex ? streamingMessage : msg
                    )
                  : [...prev.messages, streamingMessage]
              )
            };
          });
        },
        // onComplete callback
        async (finalContent: string, messageId: string, agentType: string | null) => {
          console.log('🏁 Streaming completed for queued message:', { 
            queueId, 
            messageId, 
            contentLength: finalContent.length,
            agentType,
            timestamp: new Date().toISOString()
          });
          
          if (!finalContent.trim()) {
            messageQueue.updateMessageStatus(queueId, 'failed', 'Empty agent response');
            return;
          }
          
          const finalMessage: ChatMessage = {
            id: `${saved.id}-final`,
            content: finalContent,
            message_type: (agentType || 'agent') as ChatMessage['message_type'],
            created_at: new Date().toISOString(),
            user_id: 'agent',
            status: 'sent',
            agent_context: { agentType: agentType || 'agent' },
            parent_message_id: saved.id // Agent response is child of user message
          };

          setChatState(prev => {
            const withoutStreaming = prev.messages.filter(m => m.id !== `streaming-${saved.id}`);
          return {
            ...prev,
            messages: sortMessagesByOrder([
              ...prev.messages.filter(m => m.id !== `streaming-${saved.id}`), 
              finalMessage
            ])
          };
          });
          
          messageQueue.updateMessageStatus(queueId, 'completed');
          console.log('✅ Queue message marked as completed:', { queueId, timestamp: new Date().toISOString() });
        },
        // onError callback
        (error: string) => {
          console.error('❌ Streaming error occurred for queued message', { 
            error, 
            queueId, 
            timestamp: new Date().toISOString() 
          });
          
          // Don't mark as failed if it was intentionally aborted
          if (error.includes('aborted') || error.includes('AbortError')) {
            console.log('🛑 Message processing was aborted intentionally', { queueId });
            messageQueue.removeFromQueue(queueId);
            return;
          }
          
          setChatState(prev => ({
            ...prev,
            messages: prev.messages.filter(m => m.id !== `streaming-${saved.id}` && !m.id.startsWith('streaming-'))
          }));
          messageQueue.updateMessageStatus(queueId, 'failed', error);
        }
      );
      
    } catch (error) {
      const errMsg = getErrorMessage(error);
      console.error('💥 Failed to process queued message:', { 
        error: errMsg, 
        queueId, 
        timestamp: new Date().toISOString() 
      });
      messageQueue.updateMessageStatus(queueId, 'failed', errMsg);
      logger.error('Failed to process queued message', { error: errMsg, queueId });
    }
  }, [user, deliberationId, services.messageService, startStreaming, setChatState, messageQueue]);

  // F001 Fix: Auto-process queue when messages are available - optimized to reduce re-renders
  const queueStats = messageQueue.getQueueStats;
  const hasWork = queueStats.queued > 0 && queueStats.canProcess;
  
  useEffect(() => {
    if (!hasWork || !user || !deliberationId) return;
    
    const processNext = async () => {
      console.log('🔍 Checking queue for next message...');
      const nextMessage = messageQueue.getNextQueuedMessage();
      if (nextMessage && user && deliberationId) {
        console.log('🚀 Processing next queued message:', { 
          messageId: nextMessage.id, 
          content: nextMessage.content.substring(0, 50) 
        });
        await processQueuedMessage(nextMessage);
      } else {
        console.log('⏸️ No messages to process:', { 
          hasNextMessage: !!nextMessage, 
          hasUser: !!user, 
          hasDeliberationId: !!deliberationId,
          queueStats: queueStats
        });
      }
    };

    console.log('📋 Queue has items, processing immediately...', queueStats);
    
    // F001 Fix: Process immediately without delay to align with timeout expectations
    processNext();
    
    // Set up interval for subsequent messages without delay for better responsiveness
    const timer = setTimeout(processNext, 100);
    return () => clearTimeout(timer);
  }, [hasWork, processQueuedMessage, user, deliberationId, messageQueue]);

  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    if (!user || !content.trim()) return;

    // Add message to queue instead of processing immediately
    const queueId = messageQueue.addToQueue(content.trim());
    
    logger.info('📤 Message queued for processing', { 
      queueId, 
      content: content.substring(0, 50),
      queueStats: messageQueue.getQueueStats, // F001 Fix: Use memoized value correctly
      timeouts: {
        streamingTimeout: '40s', // F004 Fix: Updated to match streaming timeout
        processingTimeout: '45s'
      }
    });

    // Show immediate feedback that message was queued
    const currentStats = messageQueue.getQueueStats;
    stableToast({
      title: "Message Queued",
      description: `Your message has been added to the queue (position ${currentStats.total}).`,
      variant: "default"
    });

  }, [user, messageQueue, stableToast]);

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
    stopStreaming,
    // Message queue functionality - memoized to prevent re-renders
    messageQueue: useMemo(() => ({
      queue: messageQueue.queue,
      stats: messageQueue.getQueueStats,
      retryMessage: messageQueue.retryMessage,
      removeMessage: messageQueue.removeFromQueue,
      clearQueue: messageQueue.clearQueue
    }), [messageQueue.queue, messageQueue.getQueueStats, messageQueue.retryMessage, messageQueue.removeFromQueue, messageQueue.clearQueue])
  };
};