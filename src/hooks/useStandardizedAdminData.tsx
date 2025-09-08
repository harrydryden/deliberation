import { useServices } from '@/hooks/useServices';
import { useDeliberationService } from '@/hooks/useDeliberationService';
import { useCrudOperations } from './useCrudOperations';
import { User, Agent, Deliberation } from '@/types/index';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

export const useStandardizedAdminData = () => {
  const services = useServices();
  const deliberationService = useDeliberationService();
  const { user } = useSupabaseAuth();

  // Users CRUD
  const users = useCrudOperations<User>({
    getAll: () => services.userService.getUsers(),
    create: async (userData) => {
      throw new Error('User creation not supported via this interface');
    },
    update: async (id, updates) => {
      if (updates.role) {
        await services.userService.updateUserRole(id, updates.role);
      }
      // Return updated user - in real implementation, you'd fetch the updated user
      const users = await services.userService.getUsers();
      return users.find(u => u.id === id)!;
    }
  }, { entityName: 'user' });

  // Global Agents CRUD
  const globalAgents = useCrudOperations<Agent, Omit<Agent, 'id' | 'created_at' | 'updated_at'>, Partial<Agent>>({
    getAll: () => services.agentService.getGlobalAgents(),
    create: (agentData) => services.agentService.createAgent(agentData),
    update: async (id, updates) => {
      const { data, error } = await supabase.rpc('admin_update_agent_configuration', {
        p_agent_id: id,
        p_updates: updates
      });

      if (error) {
        throw new Error(`Failed to update agent: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error(`No agent found with id: ${id}`);
      }

      return data[0];
    }
  }, { entityName: 'global agent' });

  // Local Agents CRUD
  const localAgents = useCrudOperations<Agent, Omit<Agent, 'id' | 'created_at' | 'updated_at'>, Partial<Agent>>({
    getAll: () => services.agentService.getLocalAgents(),
    create: (agentData) => services.agentService.createAgent(agentData),
    update: async (id, updates) => {
      const { data, error } = await supabase.rpc('admin_update_agent_configuration', {
        p_agent_id: id,
        p_updates: updates
      });

      if (error) {
        throw new Error(`Failed to update agent: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error(`No agent found with id: ${id}`);
      }

      return data[0];
    }
  }, { entityName: 'local agent' });

  // Deliberations CRUD
  const deliberations = useCrudOperations<Deliberation, any, Partial<Deliberation>>({
    getAll: () => deliberationService.getDeliberations(),
    create: async (deliberationData) => {
      return await deliberationService.createDeliberation(deliberationData);
    },
    update: async () => {
      throw new Error('Deliberation updates not implemented');
    }
  }, { entityName: 'deliberation' });

  // Custom admin operations that don't fit CRUD pattern
  const archiveUser = async (userId: string, reason?: string) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }
    await services.adminService.archiveUser(userId, user.id, reason);
    await users.load(); // Refresh users list
  };

  const unarchiveUser = async (userId: string) => {
    await services.adminService.unarchiveUser(userId);
    await users.load(); // Refresh users list
  };

  return {
    users: {
      ...users,
      archiveUser,
      unarchiveUser
    },
    globalAgents,
    localAgents,
    deliberations
  };
};