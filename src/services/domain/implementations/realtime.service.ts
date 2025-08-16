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
            // Map database columns to TypeScript interface
            const mappedMessage: Message = {
              id: payload.new.id,
              content: payload.new.content,
              messageType: payload.new.message_type, // Map from database column name
              userId: payload.new.user_id, // Map from database column name
              deliberationId: payload.new.deliberation_id, // Map from database column name
              createdAt: payload.new.created_at,
              updatedAt: payload.new.updated_at,
              agentContext: payload.new.agent_context,
              parentMessageId: payload.new.parent_message_id,
              submittedToIbis: payload.new.submitted_to_ibis,
            } as Message;
            callback(mappedMessage);
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
            const { new: new_record, old: old_record, eventType } = payload;
            
            logger.info('Deliberation change received via realtime', { 
              deliberationId: (new_record as any)?.id || (old_record as any)?.id,
              event: eventType 
            });
            
            if (eventType === 'DELETE') {
              callback({
                id: (old_record as any)?.id || '',
                title: '',
                description: '',
                status: 'deleted',
                createdAt: '',
                updatedAt: '',
              } as Deliberation);
            } else if (new_record && (new_record as any).id) {
              callback({
                id: (new_record as any).id,
                title: (new_record as any).title || '',
                description: (new_record as any).description || '',
                status: (new_record as any).status || '',
                createdAt: (new_record as any).created_at || '',
                updatedAt: (new_record as any).updated_at || '',
              } as Deliberation);
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