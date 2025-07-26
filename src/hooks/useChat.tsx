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
  submitted_to_ibis?: boolean;
}

export const useChat = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());

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
            setLastActivityTime(Date.now());
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  // Set up proactive engagement timer
  useEffect(() => {
    if (!user) return;

    const checkProactiveEngagement = () => {
      const minutesSinceLastActivity = (Date.now() - lastActivityTime) / 60000;
      
      // Trigger proactive engagement after 5 minutes of inactivity
      if (minutesSinceLastActivity >= 5) {
        console.log('Triggering proactive engagement check');
        handleProactiveEngagement();
      }
    };

    // Check every minute
    const intervalId = setInterval(checkProactiveEngagement, 60000);

    return () => clearInterval(intervalId);
  }, [user, lastActivityTime]);

  const handleProactiveEngagement = async () => {
    if (!user) return;

    try {
      // Call orchestrator without content to trigger proactive engagement
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
  };

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