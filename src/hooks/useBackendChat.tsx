import { useState, useEffect, useCallback, useRef } from "react";
import { useBackendAuth } from "./useBackendAuth";
import { backendServiceFactory } from '@/services/backend/factory';
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage } from "@/types/chat";
import { convertApiMessagesToChatMessages } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";

export const useBackendChat = (deliberationId?: string) => {
  const { user, isAuthenticated } = useBackendAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

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
      console.error('Failed to setup real-time updates:', error);
    }
  };

  const loadChatHistory = async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const messageService = backendServiceFactory.getMessageService();
      const data = await messageService.getMessages(deliberationId);
      setMessages(convertApiMessagesToChatMessages(data || []));
    } catch (error: any) {
      console.error('Error loading chat history:', getErrorMessage(error));
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load chat history",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    if (!isAuthenticated || !content.trim()) return;

    try {
      setIsTyping(true);
      
      const messageService = backendServiceFactory.getMessageService();
      await messageService.sendMessage(content.trim(), 'user', deliberationId, mode);
      
      // The real-time update will handle adding the message to the UI
    } catch (error: any) {
      console.error('Error sending message:', getErrorMessage(error));
      setIsTyping(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message",
      });
    }
  };

  return {
    messages,
    isLoading,
    isTyping,
    sendMessage,
    loadChatHistory,
  };
};