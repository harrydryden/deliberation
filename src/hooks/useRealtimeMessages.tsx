import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  content: string;
  message_type: 'user' | 'bill_agent' | 'peer_agent' | 'flow_agent';
  created_at: string;
  user_id: string | null;
  profiles?: {
    display_name: string;
  } | null;
}

export function useRealtimeMessages(deliberationId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deliberationId) return;

    // Initial fetch
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select(`
            *,
            profiles(display_name)
          `)
          .eq('deliberation_id', deliberationId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setMessages((data || []) as unknown as Message[]);
      } catch (error) {
        console.error('Error fetching messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    // Set up realtime subscription
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `deliberation_id=eq.${deliberationId}`
        },
        (payload) => {
          console.log('New message received:', payload);
          const newMessage = payload.new as any;
          
          // Fetch the complete message with profile data
          supabase
            .from('messages')
            .select(`
              *,
              profiles(display_name)
            `)
            .eq('id', newMessage.id)
            .single()
            .then(({ data }) => {
              if (data) {
                setMessages(prev => [...prev, data as unknown as Message]);
              }
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deliberationId]);

  const sendMessage = async (content: string, userId: string) => {
    if (!deliberationId || !content.trim()) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          content: content.trim(),
          deliberation_id: deliberationId,
          user_id: userId,
          message_type: 'user'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  return { messages, loading, sendMessage };
}