import { useState, useEffect, useCallback, useRef } from "react";
import { useBackendAuth } from "./useBackendAuth";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage } from "@/types/chat";

export const useBackendChat = () => {
  const { user, isAuthenticated } = useBackendAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load chat history when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadChatHistory();
      setupRealTimeUpdates();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [isAuthenticated]);

  const setupRealTimeUpdates = () => {
    if (!isAuthenticated) return;

    try {
      const eventSource = apiClient.createEventSource('/messages/stream');
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message') {
            const newMessage = data.message as ChatMessage;
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(msg => msg.id === newMessage.id)) {
                return prev;
              }
              return [...prev, newMessage];
            });
            setIsTyping(false);
          } else if (data.type === 'typing') {
            setIsTyping(data.isTyping);
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        eventSource.close();
      };
    } catch (error) {
      console.error('Failed to setup real-time updates:', error);
    }
  };

  const loadChatHistory = async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const data = await apiClient.getMessages();
      setMessages(data || []);
    } catch (error: any) {
      console.error('Error loading chat history:', error);
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
      
      // Send message to backend
      const message = await apiClient.sendMessage(content.trim());
      
      // The real-time update will handle adding the message to the UI
    } catch (error: any) {
      console.error('Error sending message:', error);
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