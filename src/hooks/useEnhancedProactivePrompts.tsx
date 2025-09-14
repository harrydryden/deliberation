import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface ProactivePrompt {
  question: string;
  context: string;
  urgency: 'low' | 'medium' | 'high';
}

interface UseEnhancedProactivePromptsOptions {
  userId: string;
  deliberationId: string;
  enabled?: boolean;
}

export const useEnhancedProactivePrompts = ({
  userId,
  deliberationId,
  enabled = true
}: UseEnhancedProactivePromptsOptions) => {
  const [currentPrompt, setCurrentPrompt] = useState<ProactivePrompt | null>(null);
  const [facilitatorSession, setFacilitatorSession] = useState<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Simple prompt timing - 5 minutes for all users
  const calculatePromptTiming = useCallback(() => {
    return 5 * 60 * 1000; // 5 minutes
  }, []);

  // Create or update facilitator session
  const initializeFacilitatorSession = useCallback(async () => {
    if (!userId || !deliberationId) return;

    try {
      // Check for existing facilitator session
      const { data: existingSession } = await supabase
        .from('facilitator_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('deliberation_id', deliberationId)
        .single();

      if (existingSession) {
        // Update existing session
        const { data: updatedSession } = await supabase
          .from('facilitator_sessions')
          .update({
            last_activity_time: new Date().toISOString(),
            session_state: {
              totalSessions: 1
            }
          })
          .eq('id', existingSession.id)
          .select()
          .single();

        setFacilitatorSession(updatedSession);
      } else {
        // Get default facilitator agent (flow_agent)
        const { data: defaultAgent } = await supabase
          .from('agent_configurations')
          .select('id')
          .eq('agent_type', 'flow_agent')
          .eq('is_active', true)
          .eq('is_default', true)
          .single();

        if (!defaultAgent) {
          logger.warn('No default flow_agent configuration found for facilitator session');
          return;
        }

        // Create new facilitator session
        const { data: newSession } = await supabase
          .from('facilitator_sessions')
          .insert({
            user_id: userId,
            deliberation_id: deliberationId,
            agent_config_id: defaultAgent.id,
            session_state: {
              totalSessions: 1,
              proactivePromptsCount: 0,
              optedOutOfPrompts: false
            },
            prompts_sent_count: 0
          })
          .select()
          .single();

        setFacilitatorSession(newSession);
      }
    } catch (error) {
      logger.error('[EnhancedProactivePrompts] Error initializing facilitator session', { error, userId, deliberationId });
    }
  }, [userId, deliberationId]);

  // Generate enhanced proactive prompt
  const generateEnhancedPrompt = useCallback(async () => {
    if (!enabled || !facilitatorSession) return;

    try {
      logger.info('[EnhancedProactivePrompts] Generating enhanced proactive prompt', { 
        userId, 
        deliberationId
      });

      // Simple session context for AI
      const sessionContext = {
        totalSessions: 1,
        isNewUser: true,
        promptsSentThisSession: facilitatorSession.session_state?.proactivePromptsCount || 0
      };

      const { data, error } = await supabase.functions.invoke('generate_proactive_prompt', {
        body: { 
          userId, 
          deliberationId, 
          sessionContext // Enhanced context
        }
      });

      if (error) {
        throw new Error(`Failed to generate enhanced proactive prompt: ${error.message}`);
      }

      if (data?.prompt) {
        setCurrentPrompt({
          question: data.prompt.question,
          context: data.prompt.context,
          urgency: 'medium'
        });

        // Update facilitator session with prompt sent
        await supabase
          .from('facilitator_sessions')
          .update({
            last_prompt_time: new Date().toISOString(),
            prompts_sent_count: (facilitatorSession.prompts_sent_count || 0) + 1,
            session_state: {
              ...facilitatorSession.session_state,
              proactivePromptsCount: (facilitatorSession.session_state?.proactivePromptsCount || 0) + 1
            }
          })
          .eq('id', facilitatorSession.id);

        logger.info('[EnhancedProactivePrompts] Enhanced proactive prompt generated and shown', { 
          userId, 
          deliberationId,
          promptContext: data.prompt.context
        });
      }
    } catch (error) {
      logger.error('[EnhancedProactivePrompts] Error generating enhanced proactive prompt', { 
        error, 
        userId, 
        deliberationId 
      });
    }
  }, [enabled, facilitatorSession, userId, deliberationId]);

  // Handle prompt response with session tracking
  const handlePromptResponse = useCallback(async (response: string) => {
    if (!currentPrompt || !facilitatorSession) return;

    try {
      logger.info('[EnhancedProactivePrompts] User responded to enhanced proactive prompt', { 
        userId, 
        deliberationId,
        responseLength: response.length,
        promptContext: currentPrompt.context
      });

      // Submit message via message service
      const { data, error } = await supabase.functions.invoke('agent_orchestration_stream', {
        body: {
          message: response,
          deliberationId,
          userId,
          triggered_by: 'enhanced_proactive_prompt',
          prompt_context: currentPrompt.context
        }
      });

      if (error) {
        throw new Error(`Failed to submit enhanced proactive prompt response: ${error.message}`);
      }

      // Update session state with engagement
      await supabase
        .from('facilitator_sessions')
        .update({
          session_state: {
            ...facilitatorSession.session_state,
            lastEngagedAt: new Date().toISOString(),
            lastPromptResponse: response.slice(0, 100) // Store truncated response for context
          }
        })
        .eq('id', facilitatorSession.id);

      setCurrentPrompt(null);
    } catch (error) {
      logger.error('[EnhancedProactivePrompts] Error submitting enhanced proactive prompt response', { 
        error, 
        userId, 
        deliberationId 
      });
    }
  }, [currentPrompt, facilitatorSession, userId, deliberationId]);

  // Handle opt-out with persistent storage
  const handlePromptOptOut = useCallback(async () => {
    if (!facilitatorSession) return;

    logger.info('[EnhancedProactivePrompts] User opted out of enhanced proactive prompts', { userId, deliberationId });
    
    // Update facilitator session with opt-out preference
    await supabase
      .from('facilitator_sessions')
      .update({
        session_state: {
          ...facilitatorSession.session_state,
          optedOutOfPrompts: true,
          optedOutAt: new Date().toISOString()
        }
      })
      .eq('id', facilitatorSession.id);

    setCurrentPrompt(null);
  }, [facilitatorSession, userId, deliberationId]);

  // Activity-based prompt scheduling
  useEffect(() => {
    if (!enabled || !facilitatorSession) return;

    // Check if user has opted out
    if (facilitatorSession.session_state?.optedOutOfPrompts) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Calculate adaptive timing
    const promptTiming = calculatePromptTiming();
    
    timeoutRef.current = setTimeout(() => {
      generateEnhancedPrompt();
    }, promptTiming);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, facilitatorSession, calculatePromptTiming, generateEnhancedPrompt]);

  // Initialize facilitator session when dependencies are ready
  useEffect(() => {
    if (userId && deliberationId) {
      initializeFacilitatorSession();
    }
  }, [userId, deliberationId, initializeFacilitatorSession]);

  return {
    currentPrompt,
    handlePromptResponse,
    handlePromptDismiss: () => setCurrentPrompt(null),
    handlePromptOptOut,
    facilitatorSession,
    isEnabled: enabled && !facilitatorSession?.session_state?.optedOutOfPrompts
  };
};