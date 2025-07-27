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

  async sendMessage(content: string, messageType: string = 'user', deliberationId?: string): Promise<Message> {
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
        deliberation_id: deliberationId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }

    const message = this.mapSupabaseMessage(data);

    // Trigger agent responses for user messages in deliberations
    if (messageType === 'user' && deliberationId) {
      this.triggerAgentResponses(message.id, deliberationId);
    }

    return message;
  }

  private async triggerAgentResponses(messageId: string, deliberationId: string) {
    try {
      console.log('🤖 Triggering agent responses for message:', messageId);
      
      // Call the agent-response edge function
      const { error } = await supabase.functions.invoke('agent-response', {
        body: { messageId, deliberationId }
      });

      if (error) {
        console.error('Failed to trigger agent responses:', error);
      } else {
        console.log('✅ Agent responses triggered successfully');
      }
    } catch (error) {
      console.error('Error triggering agent responses:', error);
    }
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