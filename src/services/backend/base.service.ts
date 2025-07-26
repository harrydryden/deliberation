import { User, ApiResponse, Message, Agent, Deliberation } from '@/types/api';

export interface IAuthService {
  authenticate(accessCode: string): Promise<{ user: User; token: string }>;
  getCurrentUser(): Promise<User>;
  refreshToken(): Promise<{ user: User; token: string }>;
  signOut(): Promise<void>;
  getToken(): string | null;
  setToken(token: string | null): void;
  hasValidToken(): boolean;
}

export interface IMessageService {
  getMessages(): Promise<Message[]>;
  sendMessage(content: string, messageType?: string): Promise<Message>;
}

export interface IAgentService {
  getAgents(): Promise<Agent[]>;
  createAgent(agent: Partial<Agent>): Promise<Agent>;
  updateAgent(id: string, agent: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
}

export interface IDeliberationService {
  getDeliberations(): Promise<Deliberation[]>;
  createDeliberation(deliberation: Partial<Deliberation>): Promise<Deliberation>;
}

export interface IRealtimeService {
  createEventSource(endpoint: string): EventSource;
  createWebSocket(): WebSocket;
  subscribeToMessages(callback: (message: Message) => void): () => void;
  subscribeToDeliberations(callback: (deliberation: Deliberation) => void): () => void;
}