// Domain service interfaces following Clean Architecture principles
import { User, Message, Agent, Deliberation } from '@/types/api';

// Simple access code authentication service
export interface ISimpleAuthService {
  authenticateWithAccessCode(accessCode: string): Promise<{ user: User; session: any }>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
}

export interface IMessageService {
  getMessages(deliberationId?: string): Promise<Message[]>;
  sendMessage(content: string, messageType?: string, deliberationId?: string, mode?: 'chat' | 'learn', userId?: string): Promise<Message>;
  getUserMessages(userId: string): Promise<Message[]>;
}

export interface IAgentService {
  getAgents(filter?: Record<string, any>): Promise<Agent[]>;
  getLocalAgents(): Promise<Agent[]>;
  getGlobalAgents(): Promise<Agent[]>;
  getAgentsByDeliberation(deliberationId: string): Promise<Agent[]>;
  createAgent(agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'>): Promise<Agent>;
  updateAgent(id: string, agent: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
}

export interface IDeliberationService {
  getDeliberations(filter?: Record<string, any>): Promise<Deliberation[]>;
  getPublicDeliberations(): Promise<Deliberation[]>;
  getUserDeliberations(userId: string): Promise<Deliberation[]>;
  createDeliberation(deliberation: Omit<Deliberation, 'id' | 'created_at' | 'updated_at'>): Promise<Deliberation>;
  updateDeliberation(id: string, deliberation: Partial<Deliberation>): Promise<Deliberation>;
  deleteDeliberation(id: string): Promise<void>;
}

export interface IUserService {
  getUsers(filter?: Record<string, any>): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, user: Partial<User>): Promise<User>;
  updateUserRole(userId: string, role: string): Promise<void>;
  
  archiveUser(userId: string, archivedBy: string, reason?: string): Promise<void>;
  unarchiveUser(userId: string): Promise<void>;
  getAllUsersIncludingArchived(filter?: Record<string, any>): Promise<User[]>;
}

export interface IAccessCodeService {
  getAccessCodes(): Promise<any[]>;
  getUnusedAccessCodes(): Promise<any[]>;
  validateAccessCode(code: string): Promise<any | null>;
  createAccessCode(codeType: string): Promise<any>;
  deleteAccessCode(id: string): Promise<void>;
}

export interface IAdminService {
  getSystemStats(): Promise<{
    totalUsers: number;
    totalDeliberations: number;
    totalMessages: number;
    activeDeliberations: number;
    totalAccessCodes: number;
    usedAccessCodes: number;
  }>;
  // Aggregate all admin operations
  getAllUsers(): Promise<User[]>;
  getAllUsersIncludingArchived(): Promise<User[]>;
  getAllAgents(): Promise<Agent[]>;
  getAllDeliberations(): Promise<Deliberation[]>;
  getAllAccessCodes(): Promise<any[]>;
  // User management
  archiveUser(userId: string, archivedBy: string, reason?: string): Promise<void>;
  unarchiveUser(userId: string): Promise<void>;
  // Deliberation management
  clearDeliberationMessages(deliberationId: string): Promise<void>;
  clearDeliberationIbis(deliberationId: string): Promise<void>;
}

export interface IRealtimeService {
  subscribeToMessages(callback: (message: Message) => void, deliberationId?: string): () => void;
  subscribeToDeliberations(callback: (deliberation: Deliberation) => void): () => void;
  subscribeToAgentInteractions(callback: (interaction: any) => void, deliberationId?: string): () => void;
}