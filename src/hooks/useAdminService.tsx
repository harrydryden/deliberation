import { useState, useEffect } from 'react';
import { backendServiceFactory } from '@/services/backend/factory';
import { IAdminService, AccessCode, AdminStats } from '@/services/backend/base.service';
import { User, Agent, Deliberation } from '@/types/api';
import { toast } from 'sonner';

export const useAdminService = () => {
  const [adminService] = useState<IAdminService>(() => backendServiceFactory.getAdminService());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Access Codes
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [loadingAccessCodes, setLoadingAccessCodes] = useState(false);

  // Agents
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Deliberations
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [loadingDeliberations, setLoadingDeliberations] = useState(false);

  // Stats
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const handleError = (error: any, operation: string) => {
    const message = error?.message || `Failed to ${operation}`;
    setError(message);
    toast.error(message);
    console.error(`Admin ${operation} error:`, error);
  };

  // User operations
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await adminService.getUsers();
      setUsers(data);
    } catch (error) {
      handleError(error, 'fetch users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    try {
      await adminService.updateUserRole(userId, role);
      toast.success('User role updated successfully');
      await fetchUsers(); // Refresh list
    } catch (error) {
      handleError(error, 'update user role');
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      await adminService.deleteUser(userId);
      toast.success('User deleted successfully');
      await fetchUsers(); // Refresh list
    } catch (error) {
      handleError(error, 'delete user');
    }
  };

  // Access Code operations
  const fetchAccessCodes = async () => {
    setLoadingAccessCodes(true);
    try {
      const data = await adminService.getAccessCodes();
      setAccessCodes(data);
    } catch (error) {
      handleError(error, 'fetch access codes');
    } finally {
      setLoadingAccessCodes(false);
    }
  };

  const createAccessCode = async (codeType: string) => {
    try {
      await adminService.createAccessCode(codeType);
      toast.success('Access code created successfully');
      await fetchAccessCodes(); // Refresh list
    } catch (error) {
      handleError(error, 'create access code');
    }
  };

  const deleteAccessCode = async (id: string) => {
    try {
      await adminService.deleteAccessCode(id);
      toast.success('Access code deleted successfully');
      await fetchAccessCodes(); // Refresh list
    } catch (error) {
      handleError(error, 'delete access code');
    }
  };

  // Agent operations
  const fetchAgents = async () => {
    setLoadingAgents(true);
    try {
      const data = await adminService.getAgentConfigurations();
      setAgents(data);
    } catch (error) {
      handleError(error, 'fetch agents');
    } finally {
      setLoadingAgents(false);
    }
  };

  const updateAgent = async (id: string, config: Partial<Agent>) => {
    try {
      await adminService.updateAgentConfiguration(id, config);
      toast.success('Agent configuration updated successfully');
      await fetchAgents(); // Refresh list
    } catch (error) {
      handleError(error, 'update agent');
    }
  };

  // Deliberation operations
  const fetchDeliberations = async () => {
    setLoadingDeliberations(true);
    try {
      const data = await adminService.getAllDeliberations();
      setDeliberations(data);
    } catch (error) {
      handleError(error, 'fetch deliberations');
    } finally {
      setLoadingDeliberations(false);
    }
  };

  const updateDeliberationStatus = async (id: string, status: string) => {
    try {
      await adminService.updateDeliberationStatus(id, status);
      toast.success('Deliberation status updated successfully');
      await fetchDeliberations(); // Refresh list
    } catch (error) {
      handleError(error, 'update deliberation status');
    }
  };

  // Stats operations
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const data = await adminService.getSystemStats();
      setStats(data);
    } catch (error) {
      handleError(error, 'fetch statistics');
    } finally {
      setLoadingStats(false);
    }
  };

  return {
    // States
    users,
    accessCodes,
    agents,
    deliberations,
    stats,
    loading,
    loadingUsers,
    loadingAccessCodes,
    loadingAgents,
    loadingDeliberations,
    loadingStats,
    error,

    // Operations
    fetchUsers,
    updateUserRole,
    deleteUser,
    fetchAccessCodes,
    createAccessCode,
    deleteAccessCode,
    fetchAgents,
    updateAgent,
    fetchDeliberations,
    updateDeliberationStatus,
    fetchStats,
  };
};