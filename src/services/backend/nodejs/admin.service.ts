import { apiClient } from '@/lib/api-client';
import { IAdminService, AccessCode, AdminStats } from '../base.service';
import { User, Agent, Deliberation } from '@/types/api';

export class NodeJSAdminService implements IAdminService {
  constructor(private getToken: () => string | null) {}

  // Users
  async getUsers(): Promise<User[]> {
    return await apiClient.adminGetUsers();
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    await apiClient.adminUpdateUserRole(userId, role);
  }

  async deleteUser(userId: string): Promise<void> {
    await apiClient.adminDeleteUser(userId);
  }

  // Access Codes
  async getAccessCodes(): Promise<AccessCode[]> {
    return await apiClient.adminGetAccessCodes();
  }

  async createAccessCode(codeType: string): Promise<AccessCode> {
    return await apiClient.adminCreateAccessCode(codeType);
  }

  async deleteAccessCode(id: string): Promise<void> {
    await apiClient.adminDeleteAccessCode(id);
  }

  // Agents
  async getAgentConfigurations(): Promise<Agent[]> {
    return await apiClient.adminGetAgentConfigurations();
  }

  async createAgentConfiguration(config: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> {
    // For now, simulate creation - in real implementation this would call the backend
    throw new Error('Agent creation not implemented for NodeJS backend yet');
  }

  async updateAgentConfiguration(id: string, config: Partial<Agent>): Promise<Agent> {
    return await apiClient.adminUpdateAgentConfiguration(id, config);
  }

  // Deliberations
  async getAllDeliberations(): Promise<Deliberation[]> {
    return await apiClient.adminGetAllDeliberations();
  }

  async updateDeliberationStatus(id: string, status: string): Promise<void> {
    await apiClient.adminUpdateDeliberationStatus(id, status);
  }

  // Statistics
  async getSystemStats(): Promise<AdminStats> {
    return await apiClient.adminGetSystemStats();
  }
}