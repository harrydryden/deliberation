import { useState, useEffect } from 'react';
import { useServices } from '@/hooks/useServices';
import { User, Agent, Deliberation, LocalAgentCreate } from '@/types/api';
import { AccessCode } from '@/repositories/implementations/access-code.repository';
import { toast } from 'sonner';
import { useErrorHandler } from './useErrorHandler';
import { logger } from '@/utils/logger';

export const useAdminData = () => {
  const services = useServices();
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

  // Local Agents
  const [localAgents, setLocalAgents] = useState<Agent[]>([]);
  const [loadingLocalAgents, setLoadingLocalAgents] = useState(false);

  // Deliberations
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [loadingDeliberations, setLoadingDeliberations] = useState(false);

  // Stats
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const { handleError: handleTypedError } = useErrorHandler();

  const handleError = (error: unknown, operation: string) => {
    const message = (error as Error)?.message || `Failed to ${operation}`;
    setError(message);
    toast.error(message);
    logger.error(`Admin ${operation} error`, error as Error);
    handleTypedError(error, `admin ${operation}`);
  };

  // User operations
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await services.userService.getUsers();
      setUsers(data);
    } catch (error) {
      handleError(error, 'fetch users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    try {
      await services.userService.updateUserRole(userId, role);
      toast.success('User role updated successfully');
      await fetchUsers();
    } catch (error) {
      handleError(error, 'update user role');
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      await services.userService.deleteUser(userId);
      toast.success('User deleted successfully');
      await fetchUsers();
    } catch (error) {
      handleError(error, 'delete user');
    }
  };

  // Access Code operations
  const fetchAccessCodes = async () => {
    setLoadingAccessCodes(true);
    try {
      const data = await services.accessCodeService.getAccessCodes();
      setAccessCodes(data);
    } catch (error) {
      handleError(error, 'fetch access codes');
    } finally {
      setLoadingAccessCodes(false);
    }
  };

  const createAccessCode = async (codeType: string) => {
    try {
      await services.accessCodeService.createAccessCode(codeType);
      toast.success('Access code created successfully');
      await fetchAccessCodes();
    } catch (error) {
      handleError(error, 'create access code');
    }
  };

  const deleteAccessCode = async (id: string) => {
    try {
      await services.accessCodeService.deleteAccessCode(id);
      toast.success('Access code deleted successfully');
      await fetchAccessCodes();
    } catch (error) {
      handleError(error, 'delete access code');
    }
  };

  // Agent operations
  const fetchAgents = async () => {
    setLoadingAgents(true);
    try {
      const data = await services.agentService.getAgents();
      setAgents(data);
    } catch (error) {
      handleError(error, 'fetch agents');
    } finally {
      setLoadingAgents(false);
    }
  };

  // Local Agent operations
  const fetchLocalAgents = async () => {
    setLoadingLocalAgents(true);
    try {
      const data = await services.agentService.getLocalAgents();
      setLocalAgents(data);
    } catch (error) {
      handleError(error, 'fetch local agents');
    } finally {
      setLoadingLocalAgents(false);
    }
  };

  // Deliberation operations
  const fetchDeliberations = async () => {
    setLoadingDeliberations(true);
    try {
      const data = await services.deliberationService.getDeliberations();
      setDeliberations(data);
    } catch (error) {
      handleError(error, 'fetch deliberations');
    } finally {
      setLoadingDeliberations(false);
    }
  };

  // Stats operations
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const data = await services.adminService.getSystemStats();
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
    localAgents,
    deliberations,
    stats,
    loading,
    loadingUsers,
    loadingAccessCodes,
    loadingAgents,
    loadingLocalAgents,
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
    fetchLocalAgents,
    fetchDeliberations,
    fetchStats,
  };
};