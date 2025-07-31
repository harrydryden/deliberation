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
  getMessages(deliberationId?: string): Promise<Message[]>;
  sendMessage(content: string, messageType?: string, deliberationId?: string, mode?: 'chat' | 'learn'): Promise<Message>;
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

export interface AccessCode {
  id: string;
  code: string;
  code_type: string;
  is_used: boolean;
  used_by?: string;
  used_at?: string;
  created_at: string;
}

export interface AdminStats {
  totalUsers: number;
  totalDeliberations: number;
  totalMessages: number;
  activeDeliberations: number;
  totalAccessCodes: number;
  usedAccessCodes: number;
}

export interface IAdminService {
  // Users
  getUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  
  // Access Codes
  getAccessCodes(): Promise<AccessCode[]>;
  createAccessCode(codeType: string): Promise<AccessCode>;
  deleteAccessCode(id: string): Promise<void>;
  
  // Agents
  getAgentConfigurations(): Promise<Agent[]>;
  createAgentConfiguration(config: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent>;
  updateAgentConfiguration(id: string, config: Partial<Agent>): Promise<Agent>;
  
  // Deliberations
  getAllDeliberations(): Promise<Deliberation[]>;
  updateDeliberationStatus(id: string, status: string): Promise<void>;
  
  // Statistics
  getSystemStats(): Promise<AdminStats>;
}