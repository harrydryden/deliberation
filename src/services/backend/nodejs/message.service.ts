import { IMessageService } from '../base.service';
import { Message } from '@/types/api';
import { BACKEND_CONFIG } from '@/config/backend';

export class NodeJSMessageService implements IMessageService {
  constructor(private getAuthToken: () => string | null) {}

  async getMessages(): Promise<Message[]> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(`${BACKEND_CONFIG.apiUrl}/api/v1/messages`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }

    const data = await response.json();
    return data.data || [];
  }

  async sendMessage(content: string, messageType: string = 'user'): Promise<Message> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(`${BACKEND_CONFIG.apiUrl}/api/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        content,
        messageType,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const data = await response.json();
    return data.data;
  }
}