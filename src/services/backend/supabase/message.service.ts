import { supabase } from '@/integrations/supabase/client';
import { IMessageService } from '../base.service';
import { Message } from '@/types/api';

export class SupabaseMessageService implements IMessageService {
  async getMessages(): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return data?.map(this.mapSupabaseMessage) || [];
  }

  async sendMessage(content: string, messageType: string = 'user'): Promise<Message> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        content,
        message_type: messageType as any,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }

    return this.mapSupabaseMessage(data);
  }

  private mapSupabaseMessage(supabaseMessage: any): Message {
    return {
      id: supabaseMessage.id,
      content: supabaseMessage.content,
      messageType: supabaseMessage.message_type,
      userId: supabaseMessage.user_id,
      createdAt: supabaseMessage.created_at,
      updatedAt: supabaseMessage.updated_at,
    };
  }
}