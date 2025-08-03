import { useState, useEffect, useCallback, useRef } from "react";
import { useBackendAuth } from "./useBackendAuth";
import { backendServiceFactory } from '@/services/backend/factory';
import type { ChatMessage } from "@/types/chat";
import { convertApiMessagesToChatMessages } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";
import { useErrorHandler } from './useErrorHandler';
import { useOptimizedArray } from './useOptimizedState';
import { logger } from '@/utils/logger';
import { performanceMonitor } from '@/utils/performanceUtils';
import { useMemoryLeakDetection } from '@/utils/performanceUtils';

export const useBackendChat = (deliberationId?: string) => {
  const { user, isAuthenticated } = useBackendAuth();
  const { handleError, handleAsyncError } = useErrorHandler();
  const [messages, setMessages] = useOptimizedArray<ChatMessage>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  useMemoryLeakDetection('useBackendChat');

  // Load chat history when user is authenticated or deliberationId changes
  useEffect(() => {
    if (isAuthenticated) {
      loadChatHistory();
      setupRealTimeUpdates();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [isAuthenticated, deliberationId]);

  const setupRealTimeUpdates = () => {
    if (!isAuthenticated) return;

    try {
      const realtimeService = backendServiceFactory.getRealtimeService();
      
      const unsubscribe = realtimeService.subscribeToMessages((message) => {
        const chatMessage: ChatMessage = {
          id: message.id,
          content: message.content,
          message_type: message.messageType as any,
          created_at: message.createdAt,
          user_id: message.userId,
        };

        // Only add messages that belong to this deliberation (or all if no deliberationId)
        // Note: For real-time, we need to get deliberation_id from the message
        // For now, we'll add all messages and let the initial load filter them
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
      });

      unsubscribeRef.current = unsubscribe;
    } catch (error) {
      handleError(error, 'real-time setup');
    }
  };

  const loadChatHistory = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    await handleAsyncError(async () => {
      const timer = performanceMonitor.startTimer('loadChatHistory');
      const messageService = backendServiceFactory.getMessageService();
      const data = await messageService.getMessages(deliberationId);
      setMessages(convertApiMessagesToChatMessages(data || []));
      timer();
      logger.api.response('GET', '/messages', 200, { deliberationId, messageCount: data?.length || 0 });
    }, 'loading chat history');
    setIsLoading(false);
  }, [isAuthenticated, deliberationId, handleAsyncError, setMessages]);

  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    if (!isAuthenticated || !content.trim()) return;

    setIsTyping(true);
    await handleAsyncError(async () => {
      const timer = performanceMonitor.startTimer('sendMessage');
      const messageService = backendServiceFactory.getMessageService();
      await messageService.sendMessage(content.trim(), 'user', deliberationId, mode);
      timer();
      logger.api.response('POST', '/messages', 200, { deliberationId, mode, contentLength: content.length });
    }, 'sending message');
    
    // Keep typing indicator on - real-time update will turn it off when response arrives
  }, [isAuthenticated, deliberationId, handleAsyncError]);

  return {
    messages,
    isLoading,
    isTyping,
    sendMessage,
    loadChatHistory,
  };
};