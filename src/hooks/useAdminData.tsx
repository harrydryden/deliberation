import { useState, useEffect, useCallback } from 'react';
import { useServices } from '@/hooks/useServices';
import { useDeliberationService } from '@/hooks/useDeliberationService';
import { User, Agent, Deliberation, LocalAgentCreate, SystemStats } from '@/types/index';
import { toast } from 'sonner';
import { useErrorHandler } from './useErrorHandler';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { logger } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';

export const useAdminData = () => {
  const services = useServices();
  const deliberationService = useDeliberationService();
  const { user, isAdmin } = useSupabaseAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

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
  const [stats, setStats] = useState<SystemStats | null>(null);
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
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await services.userService.getUsers();
      setUsers(data);
    } catch (error) {
      handleError(error, 'fetch users');
    } finally {
      setLoadingUsers(false);
    }
  }, [services.userService]);

  const updateUserRole = useCallback(async (userId: string, role: string) => {
    try {
      await services.userService.updateUserRole(userId, role);
      toast.success('User role updated successfully');
      await fetchUsers();
    } catch (error) {
      handleError(error, 'update user role');
    }
  }, [services.userService, fetchUsers]);

  const archiveUser = useCallback(async (userId: string, reason?: string) => {
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }
      await services.adminService.archiveUser(userId, user.id, reason);
      toast.success('User archived successfully');
      await fetchUsers();
    } catch (error) {
      handleError(error, 'archive user');
    }
  }, [services.adminService, user?.id, fetchUsers]);

  const unarchiveUser = useCallback(async (userId: string) => {
    try {
      await services.adminService.unarchiveUser(userId);
      toast.success('User unarchived successfully');
      await fetchUsers();
    } catch (error) {
      handleError(error, 'unarchive user');
    }
  }, [services.adminService, fetchUsers]);


  // Note: Access code functions are deprecated - access codes no longer exist

  // Agent operations
  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const data = await services.agentService.getGlobalAgents();
      setAgents(data);
    } catch (error) {
      handleError(error, 'fetch global agents');
    } finally {
      setLoadingAgents(false);
    }
  }, [services.agentService]);

  // Local Agent operations
  const fetchLocalAgents = useCallback(async () => {
    setLoadingLocalAgents(true);
    try {
      const data = await services.agentService.getLocalAgents();
      setLocalAgents(data);
    } catch (error) {
      handleError(error, 'fetch local agents');
    } finally {
      setLoadingLocalAgents(false);
    }
  }, [services.agentService]);

  // Deliberation operations
  const fetchDeliberations = useCallback(async () => {
    setLoadingDeliberations(true);
    try {
      const data = await deliberationService.getDeliberations();
      setDeliberations(data);
    } catch (error) {
      handleError(error, 'fetch deliberations');
    } finally {
      setLoadingDeliberations(false);
    }
  }, [deliberationService]);

  const fetchStats = useCallback(async () => {
    // Only fetch stats if the user is an admin
    if (!isAdmin) {
      setStats(null);
      setLoadingStats(false);
      return;
    }

    setLoadingStats(true);
    try {
      const data = await services.adminService.getSystemStats();
      setStats(data);
    } catch (error) {
      handleError(error, 'fetch statistics');
    } finally {
      setLoadingStats(false);
    }
  }, [isAdmin, services.adminService]);

  // Agent update and creation operations
  const updateAgent = async (id: string, updates: Partial<Agent>) => {
    try {
      const { data, error } = await supabase.rpc('admin_update_agent_configuration', {
        p_agent_id: id,
        p_updates: updates
      });

      if (error) {
        logger.error('Database function error', { agentId: id, error });
        throw new Error(`Failed to update agent: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error(`No agent found with id: ${id}`);
      }
      
      // Update local state
      setAgents(prevAgents => 
        prevAgents.map(agent => 
          agent.id === id ? { ...agent, ...updates } : agent
        )
      );
      
      toast.success('Agent updated successfully');
      logger.info('Global agent updated', { agentId: id, updates });
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
      } as Omit<Agent, 'id' | 'created_at'>;
      
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

  // Local agent operations
  const updateLocalAgent = async (id: string, updates: Partial<Agent>) => {
    try {
      const { data, error } = await supabase.rpc('admin_update_agent_configuration', {
        p_agent_id: id,
        p_updates: updates
      });

      if (error) {
        logger.error('Database function error', { agentId: id, error });
        throw new Error(`Failed to update agent: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error(`No agent found with id: ${id}`);
      }

      // Update local state for local agents
      setLocalAgents(prevAgents => 
        prevAgents.map(agent => 
          agent.id === id ? { ...agent, ...updates } : agent
        )
      );
      
      toast.success('Local agent updated successfully');
      logger.info('Local agent updated', { agentId: id, updates });
    } catch (error) {
      handleError(error, 'update local agent');
      throw error;
    }
  };

  const createLocalAgent = async (agentData: LocalAgentCreate): Promise<Agent> => {
    try {
      // Convert LocalAgentCreate to the format expected by the service
      const fullAgentData: Omit<Agent, 'id' | 'created_at'> = {
        name: agentData.name,
        agent_type: agentData.agent_type,
        deliberation_id: agentData.deliberationId,
        description: agentData.description,
        response_style: agentData.response_style,
        goals: agentData.goals,
        facilitator_config: agentData.facilitator_config,
        is_active: true,
        is_default: false,
        preset_questions: [],
        prompt_overrides: {}
      };
      
      const newAgent = await services.agentService.createAgent(fullAgentData);
      
      // Add to local state
      setLocalAgents(prevAgents => [...prevAgents, newAgent]);
      
      toast.success('Local agent created successfully');
      logger.info('Local agent created', { agentId: newAgent.id });
      return newAgent;
    } catch (error) {
      handleError(error, 'create local agent');
      throw error;
    }
  };

  return {
    // States
    users,
    agents,
    localAgents,
    deliberations,
    stats,
    loading,
    loadingUsers,
    loadingAgents,
    loadingLocalAgents,
    loadingDeliberations,
    loadingStats,
    error,

    // Operations
    fetchUsers,
    updateUserRole,
    archiveUser,
    unarchiveUser,
    fetchAgents,
    updateAgent,
    createAgent,
    fetchLocalAgents,
    updateLocalAgent,
    createLocalAgent,
    fetchDeliberations,
    fetchStats,
  };
};