import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { useServices } from '@/hooks/useServices';
import type { ChatMessage } from "@/types/chat";
import { convertApiMessagesToChatMessages, convertApiMessageToChatMessage } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";
import { useErrorHandler } from './useErrorHandler';
import { useOptimizedArray } from './useOptimizedState';
import { logger } from '@/utils/logger';
import { performanceMonitor } from '@/utils/performanceUtils';
import { useMemoryLeakDetection } from '@/utils/performanceUtils';
import { useToast } from '@/hooks/use-toast';

export const useChat = (deliberationId?: string) => {
  const { user, isLoading: authLoading } = useAuth();
  const { messageService, realtimeService } = useServices();
  const { handleError, handleAsyncError } = useErrorHandler();
  const [messages, setMessages] = useOptimizedArray<ChatMessage>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
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
      }
    };
  }, [user, authLoading, deliberationId]);

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
        if (message.messageType.includes('agent') || message.messageType === 'peer_agent' || message.messageType === 'bill_agent' || message.messageType === 'flow_agent') {
          setIsTyping(false);
        }
      }, deliberationId);

      unsubscribeRef.current = unsubscribe;
    } catch (error) {
      handleError(error, 'real-time setup');
    }
  };

  const loadChatHistory = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    await handleAsyncError(async () => {
      const timer = performanceMonitor.startTimer('loadChatHistory');
      const data = await messageService.getMessages(deliberationId);
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
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: 'failed', error: errMsg } : m)));
      setIsTyping(false);
      throw error;
    }
    // Keep typing until agent message arrives (realtime turns it off)
  }, [user, deliberationId, setMessages, messageService]);

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
    isTyping,
    sendMessage,
    loadChatHistory,
    retryMessage,
  };
};
