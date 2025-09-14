import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Agent } from '@/types/index';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { logger } from '@/utils/logger';

export const useUserAgents = () => {
  const { user } = useSupabaseAuth();
  const [localAgents, setLocalAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchUserAccessibleLocalAgents = async () => {
    setLoading(true);
    try {
      // Check if user is authenticated
      if (!user) {
        setLocalAgents([]);
        return;
      }

      // First, get deliberations the user participates in
      const { data: participations, error: participationError } = await supabase
        .from('participants')
        .select('deliberation_id')
        .eq('user_id', user.id);

      if (participationError) {
        logger.error('Error fetching user participations', { participationError });
        throw participationError;
      }

      if (!participations || participations.length === 0) {
        logger.component.update('useUserAgents', { action: 'noDeliberations' });
        setLocalAgents([]);
        return;
      }

      const deliberationIds = participations.map(p => p.deliberation_id);

      // Now get local agents for those deliberations
      const { data: agentConfigs, error: agentError } = await supabase
        .from('agent_configurations')
        .select(`
          *,
          deliberations:deliberation_id (
            id,
            title,
            status
          )
        `)
        .in('deliberation_id', deliberationIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (agentError) {
        logger.error('Error fetching local agents', { agentError });
        throw agentError;
      }

      const formattedAgents: Agent[] = agentConfigs?.map(config => ({
        id: config.id,
        name: config.name,
        description: config.description || '',
        response_style: config.response_style,
        goals: config.goals || [],
        agent_type: config.agent_type,
        facilitator_config: config.facilitator_config || undefined,
        is_default: config.is_default || false,
        is_active: config.is_active || false,
        created_at: config.created_at,
        updated_at: config.updated_at,
      })) || [];
      setLocalAgents(formattedAgents);
    } catch (error: any) {
      logger.error('Error fetching user accessible local agents', { error });
      toast({
        title: "Error",
        description: "Failed to load available agents",
        variant: "destructive"
      });
      setLocalAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserAccessibleLocalAgents();
  }, []);

  return {
    localAgents,
    loading,
    refetch: fetchUserAccessibleLocalAgents
  };
};