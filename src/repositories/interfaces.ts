// Repository interfaces following the Repository pattern
import { User, Message, Agent, Deliberation } from '@/types/api';

export interface IRepository<T> {
  findAll(filter?: Record<string, any>): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(data: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface IUserRepository extends IRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  updateRole(userId: string, role: string): Promise<void>;
  archiveUser(userId: string, archivedBy: string, reason?: string): Promise<void>;
  unarchiveUser(userId: string): Promise<void>;
  findAllIncludingArchived(filter?: Record<string, any>): Promise<User[]>;
}

export interface IMessageRepository extends IRepository<Message> {
  findByDeliberation(deliberationId: string): Promise<Message[]>;
  findByUser(userId: string): Promise<Message[]>;
}

export interface IAgentRepository extends IRepository<Agent> {
  findByDeliberation(deliberationId: string): Promise<Agent[]>;
  findLocalAgents(): Promise<Agent[]>;
  findGlobalAgents(): Promise<Agent[]>;
}

export interface IDeliberationRepository extends IRepository<Deliberation> {
  findByStatus(status: string): Promise<Deliberation[]>;
  findByFacilitator(facilitatorId: string): Promise<Deliberation[]>;
  findPublic(): Promise<Deliberation[]>;
}

export interface IAccessCodeRepository {
  findAll(): Promise<any[]>;
  findByCode(code: string): Promise<any | null>;
  create(codeType: string): Promise<any>;
  delete(id: string): Promise<void>;
  findUnused(): Promise<any[]>;
}

// Admin-specific repository interfaces
export interface IAdminRepository {
  getSystemStats(): Promise<{
    totalUsers: number;
    totalDeliberations: number;
    totalMessages: number;
    activeDeliberations: number;
    totalAccessCodes: number;
    usedAccessCodes: number;
  }>;
  clearDeliberationMessages(deliberationId: string): Promise<void>;
  clearDeliberationIbis(deliberationId: string): Promise<void>;
}