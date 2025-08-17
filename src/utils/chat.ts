import { ChatMessage } from '@/types/chat';
import { Message } from '@/types/api';

export function convertApiMessageToChatMessage(apiMessage: any): ChatMessage {
  return {
    id: apiMessage.id,
    content: apiMessage.content,
    message_type: apiMessage.message_type || apiMessage.messageType as ChatMessage['message_type'],
    created_at: apiMessage.created_at || apiMessage.createdAt,
    user_id: apiMessage.user_id || apiMessage.userId,
    agent_context: apiMessage.agent_context,
    submitted_to_ibis: apiMessage.submitted_to_ibis || false,
  };
}

export function convertChatMessageToApiMessage(chatMessage: Partial<ChatMessage>): Partial<Message> {
  return {
    content: chatMessage.content,
    messageType: chatMessage.message_type,
  };
}

export function convertApiMessagesToChatMessages(apiMessages: Message[]): ChatMessage[] {
  return apiMessages.map(convertApiMessageToChatMessage);
}