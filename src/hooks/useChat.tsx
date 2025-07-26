import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSessionState } from "./useSessionState";
import { useProactiveEngagement } from "./useProactiveEngagement";
import type { ChatMessage } from "@/types/chat";

export const useChat = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  const { 
    sessionState, 
    updateActivity, 
    incrementProactivePrompts, 
    getMinutesSinceLastActivity 
  } = useSessionState(user?.id);

  // Load chat history when user is available
  useEffect(() => {
    if (user) {
      loadChatHistory();
      
      // Set up real-time message updates
      const channel = supabase
        .channel('chat-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            const newMessage = payload.new as ChatMessage;
            setMessages(prev => {
              // Avoid duplicates by checking if message already exists
              if (prev.some(msg => msg.id === newMessage.id)) {
                return prev;
              }
              return [...prev, newMessage];
              });
              setIsTyping(false);
              updateActivity();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const handleProactiveEngagement = useCallback(async () => {
    if (!user) return;

    try {
      incrementProactivePrompts();
      const { error: orchestratorError } = await supabase.functions.invoke(
        'ai-deliberation-orchestrator',
        {
          body: {
            user_id: user.id,
            // No content or message_id - signals proactive engagement check
          }
        }
      );

      if (orchestratorError) {
        console.error('Proactive engagement error:', orchestratorError);
      }
    } catch (error: any) {
      console.error('Error triggering proactive engagement:', error);
    }
  }, [user, incrementProactivePrompts]);

  // Set up proactive engagement
  useProactiveEngagement({
    user,
    lastActivityTime: sessionState.lastActivityTime,
    onTriggerEngagement: handleProactiveEngagement
  });

  const loadChatHistory = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, message_type, created_at, user_id, agent_context, submitted_to_ibis')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
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
    if (!user || !content.trim()) return;

    try {
      // Insert user message
      const { data: userMessage, error: messageError } = await supabase
        .from('messages')
        .insert({
          content: content.trim(),
          message_type: 'user',
          user_id: user.id,
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Don't add to local state here - real-time subscription will handle it
      setIsTyping(true);
      updateActivity(); // Track user activity

      // Trigger AI response via edge function
      const { error: orchestratorError } = await supabase.functions.invoke(
        'ai-deliberation-orchestrator',
        {
          body: {
            message_id: userMessage.id,
            user_id: user.id,
            content: content.trim(),
            session_state: sessionState,
          }
        }
      );

      if (orchestratorError) {
        console.error('Orchestrator error:', orchestratorError);
        setIsTyping(false);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to get AI response",
        });
      }
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