import { AuthResponse, User, Message, Agent, Deliberation, ApiError } from '@/types/api';
import { handleApiError, NetworkError } from '@/utils/errors';
import { authService } from '@/services/auth.service';

interface ApiConfig {
  baseUrl: string;
  timeout: number;
}

class ApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  setToken(token: string | null): void {
    authService.setToken(token);
  }

  getToken(): string | null {
    return authService.getToken();
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}/api/v1${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    const token = authService.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Use default error message if response is not JSON
        }
        
        throw new NetworkError(errorMessage);
      }

      return response.json();
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Authentication endpoints
  async authenticate(accessCode: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/auth', {
      method: 'POST',
      body: JSON.stringify({ accessCode }),
    });
  }

  async signOut(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      authService.clearAuth();
    }
  }

  async refreshToken(): Promise<{ token: string }> {
    return this.request<{ token: string }>('/auth/refresh', {
      method: 'POST',
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // Message endpoints
  async getMessages(): Promise<Message[]> {
    return this.request<Message[]>('/messages');
  }

  async sendMessage(content: string, messageType: string = 'user'): Promise<Message> {
    return this.request<Message>('/messages', {
      method: 'POST',
      body: JSON.stringify({ content, messageType }),
    });
  }

  // Agent endpoints
  async getAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('/agents');
  }

  async createAgent(config: Record<string, any>): Promise<Agent> {
    return this.request<Agent>('/agents', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateAgent(id: string, config: Record<string, any>): Promise<Agent> {
    return this.request<Agent>(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteAgent(id: string): Promise<void> {
    return this.request<void>(`/agents/${id}`, {
      method: 'DELETE',
    });
  }

  // Deliberation endpoints
  async getDeliberations(): Promise<Deliberation[]> {
    return this.request<Deliberation[]>('/deliberations');
  }

  async createDeliberation(data: Record<string, any>): Promise<Deliberation> {
    return this.request<Deliberation>('/deliberations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Server-Sent Events for real-time updates
  createEventSource(endpoint: string): EventSource {
    const url = `${this.config.baseUrl}/api/v1/sse${endpoint}`;
    const eventSource = new EventSource(url);
    return eventSource;
  }

  // WebSocket connection
  createWebSocket(): WebSocket {
    const protocol = this.config.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${new URL(this.config.baseUrl).host}/ws`;
    return new WebSocket(wsUrl);
  }
}

// Default configuration - adjust for your environment
const config: ApiConfig = {
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 30000,
};

export const apiClient = new ApiClient(config);