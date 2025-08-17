import { supabase, setUserContext } from '@/integrations/supabase/client';
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
      // Ensure user context is properly set for RLS policies
      const contextSet = await this.ensureUserContextWithRetry();
      if (!contextSet) {
        logger.warn('Could not set user context for RLS, may return empty results', { deliberationId });
      }
      
      logger.info('Loading messages for deliberation', { deliberationId, contextSet });
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Message repository findByDeliberation error', error, { deliberationId });
        throw error;
      }

      logger.info('Messages loaded successfully', { 
        deliberationId, 
        messageCount: data?.length || 0,
        contextSet
      });

      return data as Message[];
    } catch (error) {
      logger.error('Message repository findByDeliberation failed', error, { deliberationId });
      throw error;
    }
  }

  private async ensureUserContextWithRetry(): Promise<boolean> {
    try {
      // Import ensureUserContext dynamically to avoid circular imports
      const { ensureUserContext } = await import('@/integrations/supabase/client');
      return await ensureUserContext();
    } catch (error) {
      // Fallback to setUserContext if ensureUserContext is not available
      const { setUserContext } = await import('@/integrations/supabase/client');
      return await setUserContext();
    }
  }

  async findByUser(userId: string): Promise<Message[]> {
    try {
      // Ensure user context is properly set for RLS policies
      const contextSet = await this.ensureUserContextWithRetry();
      if (!contextSet) {
        logger.warn('Could not set user context for RLS, may return empty results', { userId });
      }
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Message repository findByUser error', error, { userId });
        throw error;
      }

      return data as Message[];
    } catch (error) {
      logger.error('Message repository findByUser failed', error, { userId });
      throw error;
    }
  }

  async create(data: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>): Promise<Message> {
    try {
      // Ensure user context is properly set for RLS policies
      const contextSet = await this.ensureUserContextWithRetry();
      if (!contextSet) {
        logger.warn('Could not set user context for RLS, message creation may fail', { userId: data.userId });
      }
      
      // Map the data to database column names
      const dbData = {
        content: data.content,
        message_type: data.messageType,
        user_id: data.userId,
        deliberation_id: (data as any).deliberationId,
      };

      const { data: result, error } = await supabase
        .from('messages')
        .insert(dbData)
        .select()
        .single();

      if (error) {
        logger.error('Message repository create error', error, { data });
        throw error;
      }

      // Agent orchestration is handled at the service layer, not repository layer

      logger.info('Message created successfully', { messageId: result.id, type: data.messageType });
      
      // Map back to API format
      return {
        id: result.id,
        content: result.content,
        messageType: result.message_type,
        userId: result.user_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      } as Message;
    } catch (error) {
      logger.error('Message repository create failed', error, { data });
      throw error;
    }
  }

}