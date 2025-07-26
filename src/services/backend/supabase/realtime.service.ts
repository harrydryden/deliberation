import { supabase } from '@/integrations/supabase/client';
import { IRealtimeService } from '../base.service';
import { Message, Deliberation } from '@/types/api';

export class SupabaseRealtimeService implements IRealtimeService {
  createEventSource(endpoint: string): EventSource {
    // For Supabase, we don't use EventSource, but we'll return a mock for compatibility
    console.warn('EventSource not used with Supabase backend');
    return new EventSource('data:text/plain,');
  }

  createWebSocket(): WebSocket {
    // For Supabase, we don't use direct WebSocket, but we'll return a mock for compatibility
    console.warn('Direct WebSocket not used with Supabase backend');
    return new WebSocket('ws://localhost:3000');
  }

  subscribeToMessages(callback: (message: Message) => void): () => void {
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const newData = payload.new as any;
          const message: Message = {
            id: newData.id,
            content: newData.content,
            messageType: newData.message_type,
            userId: newData.user_id,
            createdAt: newData.created_at,
            updatedAt: newData.updated_at,
          };
          callback(message);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  subscribeToDeliberations(callback: (deliberation: Deliberation) => void): () => void {
    const channel = supabase
      .channel('deliberations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliberations'
        },
        (payload) => {
          const newData = payload.new as any;
          const deliberation: Deliberation = {
            id: newData.id,
            title: newData.title,
            description: newData.description,
            status: newData.status,
            createdAt: newData.created_at,
            updatedAt: newData.updated_at,
          };
          callback(deliberation);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}