import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  content: string;
  message_type: 'user' | 'bill_agent' | 'peer_agent' | 'flow_agent';
  created_at: string;
  user_id?: string;
  agent_context?: any;
}

export const useChat = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

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
            setMessages(prev => [...prev, newMessage]);
            setIsTyping(false);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const loadChatHistory = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
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

      // Add message to local state immediately
      setMessages(prev => [...prev, userMessage]);
      setIsTyping(true);

      // Trigger AI response via edge function
      const { error: orchestratorError } = await supabase.functions.invoke(
        'ai-deliberation-orchestrator',
        {
          body: {
            message_id: userMessage.id,
            user_id: user.id,
            content: content.trim(),
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