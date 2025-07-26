interface ApiConfig {
  baseUrl: string;
  timeout: number;
}

class ApiClient {
  private config: ApiConfig;
  private token: string | null = null;

  constructor(config: ApiConfig) {
    this.config = config;
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
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

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Authentication endpoints
  async authenticate(accessCode: string, displayName?: string) {
    return this.request<{ token: string; user: any }>('/auth/auth', {
      method: 'POST',
      body: JSON.stringify({ accessCode, displayName }),
    });
  }

  async signOut() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async refreshToken() {
    return this.request<{ token: string }>('/auth/refresh', {
      method: 'POST',
    });
  }

  // Message endpoints
  async getMessages() {
    return this.request<any[]>('/messages');
  }

  async sendMessage(content: string, messageType: string = 'user') {
    return this.request<any>('/messages', {
      method: 'POST',
      body: JSON.stringify({ content, messageType }),
    });
  }

  // Agent endpoints
  async getAgents() {
    return this.request<any[]>('/agents');
  }

  async createAgent(config: any) {
    return this.request<any>('/agents', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateAgent(id: string, config: any) {
    return this.request<any>(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteAgent(id: string) {
    return this.request<void>(`/agents/${id}`, {
      method: 'DELETE',
    });
  }

  // Deliberation endpoints
  async getDeliberations() {
    return this.request<any[]>('/deliberations');
  }

  async createDeliberation(data: any) {
    return this.request<any>('/deliberations', {
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