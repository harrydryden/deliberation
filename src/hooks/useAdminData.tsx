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

  const archiveUser = async (userId: string, reason?: string) => {
    try {
      // Get current user for archivedBy field - this would need to be passed from context
      const currentUserId = 'admin'; // TODO: Get from auth context when implemented
      await services.adminService.archiveUser(userId, currentUserId, reason);
      toast.success('User archived successfully');
      await fetchUsers();
    } catch (error) {
      handleError(error, 'archive user');
    }
  };

  const unarchiveUser = async (userId: string) => {
    try {
      await services.adminService.unarchiveUser(userId);
      toast.success('User unarchived successfully');
      await fetchUsers();
    } catch (error) {
      handleError(error, 'unarchive user');
    }
  };

  const deleteUser = async (userId: string) => {
    // Deprecated - redirect to archiving
    console.warn('deleteUser is deprecated. Use archiveUser instead.');
    await archiveUser(userId, 'User deletion requested - converted to archive');
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
      const data = await services.agentService.getGlobalAgents();
      setAgents(data);
    } catch (error) {
      handleError(error, 'fetch global agents');
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

  // Agent update and creation operations
  const updateAgent = async (id: string, updates: Partial<Agent>) => {
    try {
      await services.agentService.updateAgent(id, updates);
      
      // Update local state
      setAgents(prevAgents => 
        prevAgents.map(agent => 
          agent.id === id ? { ...agent, ...updates } : agent
        )
      );
      
      toast.success('Agent updated successfully');
      logger.info('Agent updated', { agentId: id, updates });
    } catch (error) {
      handleError(error, 'update agent');
      throw error;
    }
  };

  const createAgent = async (agentData: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      // Convert camelCase to snake_case for the API
      const apiAgentData = {
        ...agentData,
        // Remove camelCase fields that don't exist in the API
      } as Omit<Agent, 'id' | 'created_at' | 'updated_at'>;
      
      const newAgent = await services.agentService.createAgent(apiAgentData);
      
      // Add to local state
      setAgents(prevAgents => [...prevAgents, newAgent]);
      
      toast.success('Agent created successfully');
      logger.info('Agent created', { agentId: newAgent.id });
      return newAgent;
    } catch (error) {
      handleError(error, 'create agent');
      throw error;
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
    deleteUser, // Deprecated
    archiveUser,
    unarchiveUser,
    fetchAccessCodes,
    createAccessCode,
    deleteAccessCode,
    fetchAgents,
    updateAgent,
    createAgent,
    fetchLocalAgents,
    fetchDeliberations,
    fetchStats,
  };
};