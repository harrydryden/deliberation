import { useState, useEffect, useCallback, useRef } from "react";
import { useBackendAuth } from "./useBackendAuth";
import { backendServiceFactory } from '@/services/backend/factory';
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage } from "@/types/chat";
import { convertApiMessagesToChatMessages } from "@/utils/chat";
import { getErrorMessage } from "@/utils/errors";

export const useBackendChat = () => {
  const { user, isAuthenticated } = useBackendAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Load chat history when user is authenticated
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
  }, [isAuthenticated]);

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

        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(msg => msg.id === chatMessage.id)) {
            return prev;
          }
          return [...prev, chatMessage];
        });
        setIsTyping(false);
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
      const data = await messageService.getMessages();
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

  const sendMessage = async (content: string) => {
    if (!isAuthenticated || !content.trim()) return;

    try {
      setIsTyping(true);
      
      const messageService = backendServiceFactory.getMessageService();
      await messageService.sendMessage(content.trim());
      
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