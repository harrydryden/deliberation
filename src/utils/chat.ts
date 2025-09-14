import { ChatMessage } from '@/types/index';
import { Message } from '@/types/index';

export function convertApiMessageToChatMessage(apiMessage: any): ChatMessage {
  return {
    id: apiMessage.id,
    content: apiMessage.content,
    message_type: apiMessage.message_type || apiMessage.messageType as ChatMessage['message_type'],
    created_at: apiMessage.created_at || apiMessage.createdAt,
    user_id: apiMessage.user_id || apiMessage.userId,
    agent_context: apiMessage.agent_context,
    submitted_to_ibis: apiMessage.submitted_to_ibis || false,
    parent_message_id: apiMessage.parent_message_id || apiMessage.parentMessageId,
  };
}

export function convertChatMessageToApiMessage(chatMessage: Partial<ChatMessage>): Partial<Message> {
  return {
    content: chatMessage.content,
    message_type: chatMessage.message_type,
    user_id: chatMessage.user_id,
    deliberation_id: chatMessage.deliberation_id,
    submitted_to_ibis: chatMessage.submitted_to_ibis,
    parent_message_id: chatMessage.parent_message_id
  };
}

export function convertApiMessagesToChatMessages(apiMessages: Message[]): ChatMessage[] {
  return apiMessages.map(convertApiMessageToChatMessage);
}