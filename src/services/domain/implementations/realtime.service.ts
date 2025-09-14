import { supabase } from '@/integrations/supabase/client';
import { IRealtimeService } from '../interfaces';
import { Message, Deliberation } from '@/types/index';
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
            logger.info(' New message received via realtime', { 
              messageId: payload.new.id,
              messageType: payload.new.message_type,
              deliberationId: payload.new.deliberation_id,
              timestamp: new Date().toISOString()
            });
            
            const message: Message = {
              id: payload.new.id,
              content: payload.new.content,
              message_type: payload.new.message_type,
              user_id: payload.new.user_id,
              deliberation_id: payload.new.deliberation_id,
              created_at: payload.new.created_at,
              updated_at: payload.new.updated_at,
              submitted_to_ibis: payload.new.submitted_to_ibis || false
            };
            
            // Enhanced logging for agent messages
            if (payload.new.message_type?.endsWith('_agent')) {
              logger.info('🤖 Agent response received via real-time', {
                messageId: payload.new.id,
                agentType: payload.new.message_type,
                contentLength: payload.new.content?.length || 0,
                deliberationId: payload.new.deliberation_id
              });
            }
            
            callback(message);
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