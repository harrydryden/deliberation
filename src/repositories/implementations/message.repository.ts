import { supabase } from '@/integrations/supabase/client';
import { BaseRepository } from './base.repository';
import { IMessageRepository } from '../interfaces';
import { Message } from '@/types/api';
import { logger } from '@/utils/logger';

export class MessageRepository extends BaseRepository<Message> implements IMessageRepository {
  constructor() {
    super('messages');
  }

  async findByDeliberation(deliberationId: string): Promise<Message[]> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error({ error, deliberationId }, 'Message repository findByDeliberation error');
        throw error;
      }

      return data as Message[];
    } catch (error) {
      logger.error({ error, deliberationId }, 'Message repository findByDeliberation failed');
      throw error;
    }
  }

  async findByUser(userId: string): Promise<Message[]> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Message repository findByUser error');
        throw error;
      }

      return data as Message[];
    } catch (error) {
      logger.error({ error, userId }, 'Message repository findByUser failed');
      throw error;
    }
  }

  // Enhanced create method for messages with agent response triggering
  async create(data: Omit<Message, 'id' | 'created_at' | 'updated_at'>): Promise<Message> {
    try {
      const { data: result, error } = await supabase
        .from('messages')
        .insert(data)
        .select()
        .single();

      if (error) {
        logger.error({ error, data }, 'Message repository create error');
        throw error;
      }

      // Trigger agent responses for user messages in deliberations
      if (data.message_type === 'user' && data.deliberation_id) {
        this.triggerAgentResponses(result.id, data.deliberation_id);
      }

      logger.info({ messageId: result.id, type: data.message_type }, 'Message created successfully');
      return result as Message;
    } catch (error) {
      logger.error({ error, data }, 'Message repository create failed');
      throw error;
    }
  }

  private async triggerAgentResponses(messageId: string, deliberationId: string): Promise<void> {
    try {
      // Use Supabase function to trigger agent responses
      const { error } = await supabase.functions.invoke('agent-orchestration', {
        body: {
          messageId,
          deliberationId,
          mode: 'chat'
        }
      });

      if (error) {
        logger.warn({ error, messageId, deliberationId }, 'Agent response trigger failed');
      } else {
        logger.info({ messageId, deliberationId }, 'Agent responses triggered');
      }
    } catch (error) {
      logger.warn({ error, messageId, deliberationId }, 'Agent response trigger error');
    }
  }
}