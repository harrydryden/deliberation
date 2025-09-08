import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useServices } from '@/hooks/useServices';
import type { ChatMessage } from "@/types/index";
import { convertApiMessagesToChatMessages, convertApiMessageToChatMessage } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";
import { useErrorHandler } from './useErrorHandler';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/use-toast';
import { useResponseStreaming } from '@/hooks/useResponseStreaming';
import { cacheService } from '@/services/cache.service';
import { useOptimizedMessageCleanup } from '@/hooks/useOptimizedMessageCleanup';
import { useMessageQueue, QueuedMessage } from '@/hooks/useMessageQueue';

export const useChat = (deliberationId?: string) => {
  const { user, isLoading: authLoading } = useSupabaseAuth();
  const { messageService, realtimeService } = useServices();
  const { handleError, handleAsyncError } = useErrorHandler();
  
  // Standard React state management for stability
  const [chatState, setChatState] = useState({
    messages: [] as ChatMessage[],
    isLoading: false,
    isTyping: false
  });
  
  // UI state for loading and typing indicators
  const [uiState, setUiState] = useState({
    isLoading: false,
    isTyping: false
  });
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const { streamingState, startStreaming, stopStreaming } = useResponseStreaming();
  const streamingContentRef = useRef<string>('');
  const streamingUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(0); // PHASE 3 FIX: Track last update time for smart throttling
  
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
          // CRITICAL FIX: Better duplicate detection for queue/realtime coordination
          const existingMessage = prev.messages.find(msg => msg.id === chatMessage.id);
          const existingStreaming = prev.messages.find(msg => msg.id.startsWith(`streaming-${message.id}`));
          const existingFinal = prev.messages.find(msg => msg.id.startsWith(`${message.id}-final`));
          
          if (existingMessage || existingStreaming || existingFinal) {
            logger.debug('🔄 Realtime duplicate ignored', { 
              messageId: chatMessage.id,
              hasExisting: !!existingMessage,
              hasStreaming: !!existingStreaming,
              hasFinal: !!existingFinal
            });
            return prev;
          }
          
          logger.info('➕ Adding realtime message', { messageId: chatMessage.id, type: chatMessage.message_type });
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
    
    logger.debug('🔧 DEBUG: Starting processQueuedMessage', { 
      queueId, 
      content: content.substring(0, 50),
      timestamp: new Date().toISOString(),
      hasUser: !!user,
      hasDeliberationId: !!deliberationId,
      queueLength: messageQueue.queue.length,
      processingCount: messageQueue.processing.size
    });
    
    try {
      // CRITICAL FIX: Update status to processing ONLY when we actually start processing
      logger.debug('📋 Marking message as processing', { queueId });
      messageQueue.updateMessageStatus(queueId, 'processing');
      
      logger.debug('📤 Sending message to service', { queueId });
      
      // Clear cache when sending new messages
      cacheService.clearNamespace('chat-history');
      
      const saved = await services.messageService.sendMessage(
        content.trim(), 
        'user', 
        deliberationId, 
        'chat', 
        user?.id
      );
      
      logger.debug('✅ Message saved to database', { 
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
      logger.debug('🚀 About to start streaming agent response', { 
        messageId: saved.id,
        queueId,
        deliberationId, 
        hasStartStreamingFn: !!startStreaming,
        timestamp: new Date().toISOString()
      });
      
      await startStreaming(
        saved.id,
        deliberationId,
        // PHASE 3 FIX: Smart throttling for streaming updates to prevent state desync
        (streamContent: string, messageId: string, agentType: string | null) => {
          if (!streamContent.trim()) return;
          
          logger.debug('Streaming update received', { 
            queueId, 
            messageId, 
            contentLength: streamContent.length,
            agentType 
          });
          
          // Store streaming content in ref to avoid frequent state updates
          streamingContentRef.current = streamContent;
          
          // Clear existing timeout
          if (streamingUpdateTimeoutRef.current) {
            clearTimeout(streamingUpdateTimeoutRef.current);
          }
          
          // PHASE 3 FIX: Smart throttling - reduce from 200ms to 100ms for better responsiveness
          // Only throttle if updates are coming rapidly (within 50ms window)
          const now = Date.now();
          const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
          lastUpdateTimeRef.current = now;
          
          const shouldThrottle = timeSinceLastUpdate < 50; // Smart batching window
          const delay = shouldThrottle ? 100 : 0; // Reduced throttle delay
          
          const updateUI = () => {
            const streamingMessage: ChatMessage = {
              id: `streaming-${saved.id}`,
              content: streamingContentRef.current,
              message_type: agentType as ChatMessage['message_type'],
              created_at: new Date().toISOString(),
              user_id: 'agent',
              status: 'streaming',
              agent_context: { agentType },
              parent_message_id: saved.id
            };

            setChatState(prev => {
              // PHASE 2 FIX: Better duplicate detection using message ID
              const existingIndex = prev.messages.findIndex(m => m.id === `streaming-${saved.id}`);
              
              logger.debug('🔄 Smart streaming update', { 
                queueId, 
                messageId, 
                contentLength: streamingContentRef.current.length,
                existingIndex,
                wasThrottled: shouldThrottle,
                delay
              });
              
              if (existingIndex >= 0) {
                const updatedMessages = [...prev.messages];
                updatedMessages[existingIndex] = streamingMessage;
                return { ...prev, messages: updatedMessages };
              } else {
                return {
                  ...prev,
                  messages: sortMessagesByOrder([...prev.messages, streamingMessage])
                };
              }
            });
          };
          
          if (delay > 0) {
            streamingUpdateTimeoutRef.current = setTimeout(updateUI, delay);
          } else {
            updateUI();
          }
        },
        // PHASE 3 FIX: Enhanced onComplete callback with proper cleanup
        async (finalContent: string, messageId: string, agentType: string | null) => {
          logger.debug('Streaming completed for queued message', { 
            queueId, 
            messageId, 
            contentLength: finalContent.length,
            agentType,
            timestamp: new Date().toISOString()
          });
          
          // PHASE 3 FIX: Clear throttling timeout with proper cleanup
          if (streamingUpdateTimeoutRef.current) {
            clearTimeout(streamingUpdateTimeoutRef.current);
            streamingUpdateTimeoutRef.current = null;
          }
          
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
            parent_message_id: saved.id
          };

          // PHASE 2 FIX: Final content update with better state management
          setChatState(prev => {
            const withoutStreaming = prev.messages.filter(m => m.id !== `streaming-${saved.id}`);
            return {
              ...prev,
              messages: sortMessagesByOrder([...withoutStreaming, finalMessage])
            };
          });
          
          messageQueue.updateMessageStatus(queueId, 'completed');
          logger.debug('Queue message marked as completed', { queueId, timestamp: new Date().toISOString() });
        },
        // PHASE 3 FIX: Enhanced onError callback with comprehensive cleanup
        (error: string) => {
          logger.error('Streaming error occurred for queued message', { 
            error, 
            queueId, 
            timestamp: new Date().toISOString() 
          });
          
          // PHASE 3 FIX: Clear any pending updates on error
          if (streamingUpdateTimeoutRef.current) {
            clearTimeout(streamingUpdateTimeoutRef.current);
            streamingUpdateTimeoutRef.current = null;
          }
          
          // Don't mark as failed if it was intentionally aborted
          if (error.includes('aborted') || error.includes('AbortError')) {
            logger.debug('Message processing was aborted intentionally', { queueId });
            messageQueue.removeFromQueue(queueId);
            return;
          }
          
          // PHASE 2 FIX: Better cleanup of streaming state
          setChatState(prev => ({
            ...prev,
            messages: prev.messages.filter(m => !m.id.startsWith(`streaming-${saved.id}`))
          }));
          
          messageQueue.updateMessageStatus(queueId, 'failed', error);
        }
      );
      
    } catch (error) {
      const errMsg = getErrorMessage(error);
      logger.error('Failed to process queued message', new Error(errMsg), { 
        queueId, 
        timestamp: new Date().toISOString() 
      });
      
      // PHASE 3 FIX: Cleanup on exception
      if (streamingUpdateTimeoutRef.current) {
        clearTimeout(streamingUpdateTimeoutRef.current);
        streamingUpdateTimeoutRef.current = null;
      }
      
      messageQueue.updateMessageStatus(queueId, 'failed', errMsg);
    }
  }, [user, deliberationId, services.messageService, startStreaming, setChatState, messageQueue]);

  // PHASE 1 FIX: Stable queue processing with proper dependency management
  const queueStats = messageQueue.getQueueStats;
  const hasWork = queueStats.queued > 0 && queueStats.canProcess;
  
  // PHASE 1 FIX: Use stable references to prevent stale closures
  const stableProcessQueuedMessage = useCallback((message: QueuedMessage) => {
    return processQueuedMessage(message);
  }, [processQueuedMessage]);
  
  const stableGetNextMessage = useCallback(() => {
    return messageQueue.getNextQueuedMessage();
  }, [messageQueue]);
  
  // ENHANCED FIX: Debounced queue processing to prevent race conditions
  const processingRef = useRef(false);
  const queueProcessingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!hasWork || !user || !deliberationId || processingRef.current) return;
    
    // Clear any existing timeout to prevent duplicate processing
    if (queueProcessingTimeoutRef.current) {
      clearTimeout(queueProcessingTimeoutRef.current);
    }
    
    const processNext = async () => {
      // RACE CONDITION FIX: Prevent concurrent processing
      if (processingRef.current) {
        logger.debug('Queue processor already running, skipping', { timestamp: new Date().toISOString() });
        return;
      }
      
      processingRef.current = true;
      
      try {
        logger.debug('🔄 Queue processor: Starting processing cycle', { 
          hasWork, 
          queueStats,
          userId: user?.id.substring(0, 8),
          deliberationId: deliberationId.substring(0, 8),
          timestamp: new Date().toISOString()
        });
        
        const nextMessage = stableGetNextMessage();
        if (nextMessage && user && deliberationId) {
          logger.info('📤 Queue processor: Processing message', { 
            messageId: nextMessage.id, 
            content: nextMessage.content.substring(0, 50),
            queuePosition: nextMessage.queuePosition,
            retries: nextMessage.retries,
            status: nextMessage.status,
            timestamp: new Date().toISOString()
          });
          
          try {
            await stableProcessQueuedMessage(nextMessage);
            logger.info('✅ Queue processor: Message processed successfully', { 
              messageId: nextMessage.id,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            logger.error('❌ Queue processor: Message processing failed', { 
              messageId: nextMessage.id, 
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString()
            });
          }
        } else {
          logger.debug('⏸️ Queue processor: No messages to process', { 
            hasNextMessage: !!nextMessage, 
            hasUser: !!user, 
            hasDeliberationId: !!deliberationId,
            queueStats,
            timestamp: new Date().toISOString()
          });
        }
      } finally {
        processingRef.current = false;
      }
    };

    // DEBOUNCED PROCESSING: Add small delay to prevent rapid re-triggering
    const { queued, failed, canProcess } = queueStats;
    if ((queued > 0 || failed > 0) && canProcess) {
      queueProcessingTimeoutRef.current = setTimeout(() => {
        processNext();
      }, 100); // 100ms debounce to prevent race conditions
    }
  }, [hasWork, user, deliberationId, stableProcessQueuedMessage, stableGetNextMessage]);
  
  // Cleanup processing timeout on unmount
  useEffect(() => {
    return () => {
      if (queueProcessingTimeoutRef.current) {
        clearTimeout(queueProcessingTimeoutRef.current);
      }
      processingRef.current = false;
    };
  }, []);

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

  // PHASE 3 FIX: Enhanced cleanup with proper timeout reference clearing
  useEffect(() => {
    return () => {
      if (streamingUpdateTimeoutRef.current) {
        clearTimeout(streamingUpdateTimeoutRef.current);
        streamingUpdateTimeoutRef.current = null;
      }
      // Reset timing references
      lastUpdateTimeRef.current = 0;
    };
  }, []);

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
      clearQueue: messageQueue.clearQueue,
      clearFailedMessages: messageQueue.clearFailedMessages,
      clearStaleMessages: messageQueue.clearStaleMessages
    }), [messageQueue.queue, messageQueue.getQueueStats, messageQueue.retryMessage, messageQueue.removeFromQueue, messageQueue.clearQueue, messageQueue.clearFailedMessages, messageQueue.clearStaleMessages])
  };
};