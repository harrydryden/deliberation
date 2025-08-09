import { supabase } from '@/integrations/supabase/client';
import { IMessageService } from '../base.service';
import { Message } from '@/types/api';

export class SupabaseMessageService implements IMessageService {
  async getMessages(deliberationId?: string): Promise<Message[]> {
    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    // Filter by deliberation_id if provided
    if (deliberationId) {
      query = query.eq('deliberation_id', deliberationId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return data?.map(this.mapSupabaseMessage) || [];
  }

  async sendMessage(content: string, messageType: string = 'user', deliberationId?: string, mode: 'chat' | 'learn' = 'chat'): Promise<Message> {
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
      this.triggerAgentResponses(message.id, deliberationId, mode);
    }

    return message;
  }

  private async triggerAgentResponses(messageId: string, deliberationId: string, mode: 'chat' | 'learn' = 'chat') {
    try {
      console.log('🤖 Triggering agent orchestration for message:', messageId, 'in deliberation:', deliberationId);
      
      // Call the new orchestration edge function
      console.log('📞 Calling agent-orchestration function...');
      const { data, error } = await supabase.functions.invoke('agent-orchestration', {
        body: { messageId, deliberationId, mode }
      });

      console.log('📊 Orchestration function response:', { data, error });

      if (error) {
        console.error('❌ Failed to trigger agent orchestration:', error);
        // Fallback to memory function
        console.log('🔄 Falling back to agent-response-with-memory function...');
        const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('agent-response-with-memory', {
          body: { messageId, deliberationId, mode }
        });
        
        if (fallbackError) {
          console.error('❌ Fallback agent response also failed:', fallbackError);
          // Notify UI that agents failed so it can stop typing and show message
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('agent-error', { detail: { source: 'fallback', error: String(fallbackError) } }));
          }
        } else {
          console.log('✅ Fallback agent response triggered successfully:', fallbackData);
        }
      } else {
        console.log('✅ Agent orchestration triggered successfully:', data);
      }
    } catch (error) {
      console.error('💥 Error triggering agent orchestration:', error);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent-error', { detail: { source: 'orchestration', error: String(error) } }));
      }
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