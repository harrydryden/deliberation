import { supabase } from '@/integrations/supabase/client';
import { IRealtimeService } from '../interfaces';
import { Message, Deliberation } from '@/types/api';
import { logger } from '@/utils/logger';

export class RealtimeService implements IRealtimeService {
  subscribeToMessages(callback: (message: Message) => void, deliberationId?: string): () => void {
    try {
      let channel = supabase
        .channel('messages-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: deliberationId ? `deliberation_id=eq.${deliberationId}` : undefined,
          },
          (payload) => {
            logger.info('New message received via realtime', { messageId: payload.new.id });
            callback(payload.new as Message);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      logger.error('Realtime service subscribeToMessages failed', { error, deliberationId });
      throw error;
    }
  }

  subscribeToDeliberations(callback: (deliberation: Deliberation) => void): () => void {
    try {
      let channel = supabase
        .channel('deliberations-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'deliberations',
          },
          (payload) => {
            logger.info('Deliberation change received via realtime', { 
              deliberationId: payload.new?.id || payload.old?.id,
              event: payload.eventType 
            });
            
            if (payload.eventType === 'DELETE') {
              callback({ ...payload.old, deleted: true } as Deliberation);
            } else {
              callback(payload.new as Deliberation);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      logger.error('Realtime service subscribeToDeliberations failed', { error });
      throw error;
    }
  }

  subscribeToAgentInteractions(callback: (interaction: any) => void, deliberationId?: string): () => void {
    try {
      let channel = supabase
        .channel('agent-interactions-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'agent_interactions',
            filter: deliberationId ? `deliberation_id=eq.${deliberationId}` : undefined,
          },
          (payload) => {
            logger.info('Agent interaction received via realtime', { 
              interactionId: payload.new.id,
              agentType: payload.new.agent_type 
            });
            callback(payload.new);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      logger.error('Realtime service subscribeToAgentInteractions failed', { error, deliberationId });
      throw error;
    }
  }
}