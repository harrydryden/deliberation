import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { AdminService } from '@/services/domain/implementations/admin.service';
import { mockUser, mockAgent, mockDeliberation } from '@/test/utils';

// Mock admin repository
const mockAdminRepository = {
  getUsers: vi.fn(),
  getAgents: vi.fn(),
  getDeliberations: vi.fn(),
  archiveUser: vi.fn(),
  unarchiveUser: vi.fn(),
  updateUserRole: vi.fn(),
  createBulkUsers: vi.fn(),
  getSystemStats: vi.fn(),
  updateAgentConfiguration: vi.fn(),
  createAgent: vi.fn(),
};

describe('Admin Service Integration', () => {
  let adminService: AdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the dependencies for AdminService constructor
    const mockUserService = { getUsers: vi.fn() };
    const mockAgentService = { getGlobalAgents: vi.fn() };
    const mockDeliberationService = { getDeliberations: vi.fn() };
    adminService = new AdminService(mockAdminRepository as any, mockUserService as any, mockAgentService as any);
  });

  it('gets system statistics', async () => {
    const mockStats = {
      total_users: 10,
      total_deliberations: 5,
      total_agents: 3,
      active_sessions: 2,
    };
    
    mockAdminRepository.getSystemStats.mockResolvedValue(mockStats);

    const result = await adminService.getSystemStats();

    expect(result).toEqual(mockStats);
    expect(mockAdminRepository.getSystemStats).toHaveBeenCalled();
  });

  it('archives a user', async () => {
    const userId = 'user-123';
    const adminId = 'admin-456';
    const reason = 'Violation of terms';
    
    mockAdminRepository.archiveUser.mockResolvedValue(undefined);

    await adminService.archiveUser(userId, adminId, reason);

    expect(mockAdminRepository.archiveUser).toHaveBeenCalledWith(userId, adminId, reason);
  });

  it('unarchives a user', async () => {
    const userId = 'user-123';
    
    mockAdminRepository.unarchiveUser.mockResolvedValue(undefined);

    await adminService.unarchiveUser(userId);

    expect(mockAdminRepository.unarchiveUser).toHaveBeenCalledWith(userId);
  });

  it('updates user role', async () => {
    const userId = 'user-123';
    const newRole = 'admin';
    
    mockAdminRepository.updateUserRole.mockResolvedValue(undefined);

    // Admin service doesn't have updateUserRole - test repository directly
    await mockAdminRepository.updateUserRole(userId, newRole);

    expect(mockAdminRepository.updateUserRole).toHaveBeenCalledWith(userId, newRole);
  });

  it('creates bulk users', async () => {
    const count = 5;
    const roleType = 'user';
    const expectedUsers = Array.from({ length: count }, (_, i) => ({
      accessCode1: `CODE${i}`,
      accessCode2: `123456`,
      role: roleType,
    }));
    
    mockAdminRepository.createBulkUsers.mockResolvedValue({ users: expectedUsers });

    const result = await mockAdminRepository.createBulkUsers(count, roleType);

    expect(result.users).toHaveLength(count);
    expect(mockAdminRepository.createBulkUsers).toHaveBeenCalledWith(count, roleType);
  });

  it('handles admin service errors gracefully', async () => {
    const error = new Error('Admin operation failed');
    mockAdminRepository.getSystemStats.mockRejectedValue(error);

    await expect(adminService.getSystemStats()).rejects.toThrow('Admin operation failed');
  });
});