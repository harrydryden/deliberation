import { IAdminService, IUserService, IAgentService, IDeliberationService, IAccessCodeService } from '../interfaces';
import { IAdminRepository } from '@/repositories/interfaces';
import { User, Agent, Deliberation } from '@/types/api';
import { AccessCode } from '@/repositories/implementations/access-code.repository';
import { logger } from '@/utils/logger';

export class AdminService implements IAdminService {
  constructor(
    private adminRepository: IAdminRepository,
    private userService: IUserService,
    private agentService: IAgentService,
    private deliberationService: IDeliberationService,
    private accessCodeService: IAccessCodeService
  ) {}

  async getSystemStats(): Promise<{
    totalUsers: number;
    totalDeliberations: number;
    totalMessages: number;
    activeDeliberations: number;
    totalAccessCodes: number;
    usedAccessCodes: number;
  }> {
    try {
      return await this.adminRepository.getSystemStats();
    } catch (error) {
      logger.error('Admin service getSystemStats failed', { error });
      throw error;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await this.userService.getUsers();
    } catch (error) {
      logger.error('Admin service getAllUsers failed', { error });
      throw error;
    }
  }

  async getAllAgents(): Promise<Agent[]> {
    try {
      return await this.agentService.getAgents();
    } catch (error) {
      logger.error('Admin service getAllAgents failed', { error });
      throw error;
    }
  }

  async getAllDeliberations(): Promise<Deliberation[]> {
    try {
      return await this.deliberationService.getDeliberations();
    } catch (error) {
      logger.error('Admin service getAllDeliberations failed', { error });
      throw error;
    }
  }

  async getAllAccessCodes(): Promise<AccessCode[]> {
    try {
      return await this.accessCodeService.getAccessCodes();
    } catch (error) {
      logger.error('Admin service getAllAccessCodes failed', { error });
      throw error;
    }
  }

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