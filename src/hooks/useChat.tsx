import { useState, useEffect, useCallback, useRef } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useServices } from '@/hooks/useServices';
import type { ChatMessage } from "@/types/index";
import { convertApiMessagesToChatMessages, convertApiMessageToChatMessage } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";
import { useErrorHandler } from './useErrorHandler';
import { useOptimizedArray } from './useOptimizedState';
import { logger } from '@/utils/logger';
import { performanceMonitor } from '@/utils/performanceUtils';
import { useMemoryLeakDetection } from '@/utils/performanceUtils';
import { useToast } from '@/hooks/use-toast';
import { useResponseStreaming } from '@/hooks/useResponseStreaming';

export const useChat = (deliberationId?: string) => {
  const { user, isLoading: authLoading } = useSupabaseAuth();
  const { messageService, realtimeService } = useServices();
  const { handleError, handleAsyncError } = useErrorHandler();
  const [messages, setMessages] = useOptimizedArray<ChatMessage>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const { streamingState, startStreaming, stopStreaming } = useResponseStreaming();
  
  useMemoryLeakDetection('useChat');

  const { toast } = useToast();

  // Load chat history when user is authenticated or deliberationId changes
  useEffect(() => {
    if (!authLoading && user) {
      loadChatHistory();
      setupRealTimeUpdates();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user, authLoading, deliberationId]);

  // Remove redundant reload - realtime updates should handle missed messages

  // Listen for agent failure events (e.g., OpenAI quota exceeded)
  useEffect(() => {
    const handler = () => {
      setIsTyping(false);
      toast({ title: 'Contact Platform Admin', description: 'AI responses are temporarily unavailable.', variant: 'destructive' });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('agent-error', handler);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('agent-error', handler);
      }
    };
  }, [toast]);

  const setupRealTimeUpdates = () => {
    if (!user) return;

    try {
      const unsubscribe = realtimeService.subscribeToMessages((message) => {
        const chatMessage: ChatMessage = {
          id: message.id,
          content: message.content,
          message_type: message.messageType as any,
          created_at: message.createdAt,
          user_id: message.userId,
        };

        // Only add messages that belong to this deliberation (or all if no deliberationId)
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(msg => msg.id === chatMessage.id)) {
            return prev;
          }
          return [...prev, chatMessage];
        });
        
        // Only stop typing indicator when an agent message comes in
        if (message.messageType && (message.messageType.includes('agent') || message.messageType === 'peer_agent' || message.messageType === 'bill_agent' || message.messageType === 'flow_agent')) {
          setIsTyping(false);
        }
      }, deliberationId);

      unsubscribeRef.current = unsubscribe;
    } catch (error) {
      handleError(error, 'real-time setup');
    }
  };

  const loadChatHistory = useCallback(async () => {
    if (!user) {
      console.log('loadChatHistory: No user found, skipping');
      return;
    }

    console.log('loadChatHistory: Starting load for', { userId: user.id, deliberationId });
    setIsLoading(true);
    
    await handleAsyncError(async () => {
      const timer = performanceMonitor.startTimer('loadChatHistory');
      
      // Debug: Check user context before loading
      console.log('loadChatHistory: About to call messageService.getMessages');
      const data = await messageService.getMessages(deliberationId);
      console.log('loadChatHistory: Received data', { 
        messageCount: data?.length || 0, 
        deliberationId,
        userId: user.id,
        firstMessage: data?.[0],
        lastMessage: data?.[data?.length - 1]
      });
      
      setMessages(convertApiMessagesToChatMessages(data || []));
      timer();
      logger.api.response('GET', '/messages', 200, { deliberationId, messageCount: data?.length || 0 });
    }, 'loading chat history');
    setIsLoading(false);
  }, [user, deliberationId, handleAsyncError, setMessages, messageService]);

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
    setMessages(prev => [...prev, optimistic]);
    setIsTyping(true);

    try {
      const timer = performanceMonitor.startTimer('sendMessage');
      const saved = await messageService.sendMessage(content.trim(), 'user', deliberationId, mode, user?.id);
      const savedChat = convertApiMessageToChatMessage(saved);
      timer();
      logger.api.response('POST', '/messages', 200, { deliberationId, mode, contentLength: content.length });

      // Replace optimistic with saved
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...savedChat, status: 'sent' } : m)));

      // Start streaming the agent response
      if (deliberationId) {
        await startStreaming(
          saved.id,
          deliberationId,
          // onUpdate callback - update streaming message in real-time
          (streamContent: string, agentType: string) => {
            const streamingMessage: ChatMessage = {
              id: `streaming-${saved.id}`,
              content: streamContent,
              message_type: agentType as ChatMessage['message_type'],
              created_at: new Date().toISOString(),
              user_id: 'agent',
              status: 'streaming',
              agent_context: { agentType }
            };

            setMessages(prev => {
              const existingStreamingIndex = prev.findIndex(m => m.id === `streaming-${saved.id}`);
              if (existingStreamingIndex >= 0) {
                // Update existing streaming message
                return prev.map((msg, index) => 
                  index === existingStreamingIndex ? streamingMessage : msg
                );
              } else {
                // Add new streaming message
                return [...prev, streamingMessage];
              }
            });
          },
          // onComplete callback - replace with final message
          async (finalContent: string, agentType: string) => {
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
              setMessages(prev => {
                const withoutStreaming = prev.filter(m => m.id !== `streaming-${saved.id}`);
                return [...withoutStreaming, finalMessage];
              });
            } catch (error) {
              logger.error('Error applying final message', { error });
            } finally {
              setIsTyping(false);
            }
          },
          // onError callback
          (error: string) => {
            logger.error('Streaming error', { error });
            setMessages(prev => prev.filter(m => m.id !== `streaming-${saved.id}`));
            setIsTyping(false);
            toast({
              title: "Response Error",
              description: "Failed to get agent response. Please try again.",
              variant: "destructive"
            });
          }
        );
      } else {
        setIsTyping(false);
      }

    } catch (error) {
      const errMsg = getErrorMessage(error);
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: 'failed', error: errMsg } : m)));
      setIsTyping(false);
      throw error;
    }
  }, [user, deliberationId, setMessages, messageService, startStreaming, loadChatHistory, toast]);

  const retryMessage = useCallback(async (id: string) => {
    const target = messages.find(m => m.id === id);
    if (!target || target.status !== 'failed') return;
    // Mark pending
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, status: 'pending', error: undefined } : m)));
    try {
      const saved = await messageService.sendMessage(target.content, 'user', deliberationId, 'chat', user?.id);
      const savedChat = convertApiMessageToChatMessage(saved);
      setMessages(prev => prev.map(m => (m.id === id ? { ...savedChat, status: 'sent' } : m)));
      setIsTyping(true);
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, status: 'failed', error: errMsg } : m)));
      setIsTyping(false);
    }
  }, [messages, deliberationId, setMessages, messageService]);

  return {
    messages,
    isLoading,
    isTyping: isTyping || streamingState.isStreaming,
    sendMessage,
    loadChatHistory,
    retryMessage,
    streamingState,
    stopStreaming
  };
};