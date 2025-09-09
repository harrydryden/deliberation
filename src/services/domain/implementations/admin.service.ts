import { IAdminService, IUserService, IAgentService } from '../interfaces';
import { IAdminRepository } from '@/repositories/interfaces';
import { User, Agent, Deliberation } from '@/types/index';
import { logger } from '@/utils/logger';

export class AdminService implements IAdminService {
  constructor(
    private adminRepository: IAdminRepository,
    private userService: IUserService,
    private agentService: IAgentService
  ) {}

  async getSystemStats(): Promise<{
    totalUsers: number;
    totalDeliberations: number;
    totalMessages: number;
    activeDeliberations: number;
  }> {
    try {
      return await this.adminRepository.getSystemStats();
    } catch (error) {
      logger.error('Admin service getSystemStats failed', { error });
      // Return safe defaults instead of throwing
      return {
        totalUsers: 0,
        totalDeliberations: 0,
        totalMessages: 0,
        activeDeliberations: 0
      };
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await this.userService.getUsers();
    } catch (error) {
      logger.error('Admin service getAllUsers failed', { error });
      // Return empty array instead of throwing
      return [];
    }
  }

  async getAllUsersIncludingArchived(): Promise<User[]> {
    try {
      return await this.userService.getAllUsersIncludingArchived();
    } catch (error) {
      logger.error('Admin service getAllUsersIncludingArchived failed', { error });
      // Return empty array instead of throwing
      return [];
    }
  }

  async archiveUser(userId: string, archivedBy: string, reason?: string): Promise<void> {
    try {
      await this.userService.archiveUser(userId, archivedBy, reason);
      logger.info('Admin archived user successfully', { userId, archivedBy, reason });
    } catch (error) {
      logger.error('Admin service archiveUser failed', { error, userId, archivedBy });
      throw error;
    }
  }

  async unarchiveUser(userId: string): Promise<void> {
    try {
      await this.userService.unarchiveUser(userId);
      logger.info('Admin unarchived user successfully', { userId });
    } catch (error) {
      logger.error('Admin service unarchiveUser failed', { error, userId });
      throw error;
    }
  }

  async getAllAgents(): Promise<Agent[]> {
    try {
      return await this.agentService.getAgents();
    } catch (error) {
      logger.error('Admin service getAllAgents failed', { error });
      // Return empty array instead of throwing
      return [];
    }
  }

  async getLocalAgents(): Promise<Agent[]> {
    try {
      return await this.agentService.getLocalAgents();
    } catch (error) {
      logger.error('Admin service getLocalAgents failed', { error });
      // Return empty array instead of throwing
      return [];
    }
  }

  async getGlobalAgents(): Promise<Agent[]> {
    try {
      return await this.agentService.getGlobalAgents();
    } catch (error) {
      logger.error('Admin service getGlobalAgents failed', { error });
      // Return empty array instead of throwing
      return [];
    }
  }

  async getAllDeliberations(): Promise<Deliberation[]> {
    // Use useDeliberationService hook directly in components instead
    throw new Error('Use useDeliberationService hook directly instead of calling getAllDeliberations');
  }

  // Access code management removed - Supabase Auth handles user creation

  async clearDeliberationMessages(deliberationId: string): Promise<void> {
    try {
      await this.adminRepository.clearDeliberationMessages(deliberationId);
      logger.info('Cleared deliberation messages', { deliberationId });
    } catch (error) {
      logger.error('Admin service clearDeliberationMessages failed', { error, deliberationId });
      throw error;
    }
  }

  async clearDeliberationIbis(deliberationId: string): Promise<void> {
    try {
      await this.adminRepository.clearDeliberationIbis(deliberationId);
      logger.info('Cleared deliberation IBIS data', { deliberationId });
    } catch (error) {
      logger.error('Admin service clearDeliberationIbis failed', { error, deliberationId });
      throw error;
    }
  }
}