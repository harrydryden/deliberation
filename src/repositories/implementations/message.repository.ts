import { supabase } from '@/integrations/supabase/client';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { IMessageRepository } from '../interfaces';
import { Message } from '@/types/index';
import { logger } from '@/utils/logger';

export class MessageRepository extends SupabaseBaseRepository implements IMessageRepository {
  
  async findAll(filter?: Record<string, any>): Promise<Message[]> {
    try {
      let query = supabase
        .from('messages')
        .select('*');

      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        logger.error('Message repository findAll error', error as Error, { filter });
        throw error;
      }

      return data.map(item => this.mapToMessage(item));
    } catch (error) {
      logger.error('Message repository findAll failed', error as Error, { filter });
      throw error;
    }
  }

  async findById(id: string): Promise<Message | null> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return this.mapToMessage(data);
    } catch (error) {
      logger.error('Message repository findById failed', error as Error, { id });
      throw error;
    }
  }

  async update(id: string, data: any): Promise<Message> {
    try {
      const { data: result, error } = await supabase
        .from('messages')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return this.mapToMessage(result);
    } catch (error) {
      logger.error('Message repository update failed', error as Error, { id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    return this.deleteFromTable('messages', id);
  }

  private mapToMessage(data: any): Message {
    return {
      id: data.id,
      content: data.content,
      messageType: data.message_type,
      userId: data.user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async findByDeliberation(deliberationId: string): Promise<Message[]> {
    try {
      // Context set automatically via headers
      logger.info('Loading messages for deliberation', { deliberationId });

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Message repository findByDeliberation error', error as Error, { deliberationId });
        throw error;
      }

      return data.map(item => this.mapToMessage(item));
    } catch (error) {
      logger.error('Message repository findByDeliberation failed', error as Error, { deliberationId });
      throw error;
    }
  }

  async findByUser(userId: string): Promise<Message[]> {
    try {
      // Context set automatically via headers
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Message repository findByUser error', error as Error, { userId });
        throw error;
      }

      return data.map(item => this.mapToMessage(item));
    } catch (error) {
      logger.error('Message repository findByUser failed', error as Error, { userId });
      throw error;
    }
  }

  async create(data: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>): Promise<Message> {
    try {
      // Context set automatically via headers
      
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
        logger.error('Message repository create error', error as Error, { data });
        throw error;
      }

      // Agent orchestration is handled at the service layer, not repository layer

      logger.info('Message created successfully', { messageId: result.id, type: data.messageType });
      
      // Map back to API format
      return this.mapToMessage(result);
    } catch (error) {
      logger.error('Message repository create failed', error as Error, { data });
      throw error;
    }
  }
}