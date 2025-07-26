import { IRealtimeService } from '../base.service';
import { Message, Deliberation } from '@/types/api';
import { BACKEND_CONFIG } from '@/config/backend';

export class NodeJSRealtimeService implements IRealtimeService {
  constructor(private getAuthToken: () => string | null) {}

  createEventSource(endpoint: string): EventSource {
    const token = this.getAuthToken();
    const url = new URL(`${BACKEND_CONFIG.apiUrl}/api/v1/sse${endpoint}`);
    if (token) {
      url.searchParams.set('token', token);
    }
    return new EventSource(url.toString());
  }

  createWebSocket(): WebSocket {
    const token = this.getAuthToken();
    const wsUrl = BACKEND_CONFIG.apiUrl?.replace('http', 'ws') || 'ws://localhost:3000';
    const url = `${wsUrl}/ws${token ? `?token=${token}` : ''}`;
    return new WebSocket(url);
  }

  subscribeToMessages(callback: (message: Message) => void): () => void {
    const eventSource = this.createEventSource('/messages');
    
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        callback(message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    eventSource.addEventListener('message', handleMessage);

    return () => {
      eventSource.removeEventListener('message', handleMessage);
      eventSource.close();
    };
  }

  subscribeToDeliberations(callback: (deliberation: Deliberation) => void): () => void {
    const eventSource = this.createEventSource('/deliberations');
    
    const handleMessage = (event: MessageEvent) => {
      try {
        const deliberation = JSON.parse(event.data);
        callback(deliberation);
      } catch (error) {
        console.error('Error parsing deliberation:', error);
      }
    };

    eventSource.addEventListener('message', handleMessage);

    return () => {
      eventSource.removeEventListener('message', handleMessage);
      eventSource.close();
    };
  }
}