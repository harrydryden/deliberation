import { ChatMessage } from '@/types/chat';
import { Message } from '@/types/api';

export function convertApiMessageToChatMessage(apiMessage: Message): ChatMessage {
  return {
    id: apiMessage.id,
    content: apiMessage.content,
    message_type: apiMessage.messageType as ChatMessage['message_type'],
    created_at: apiMessage.createdAt,
    user_id: apiMessage.userId,
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