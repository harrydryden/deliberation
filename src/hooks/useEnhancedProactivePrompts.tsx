import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { useSessionTracking } from './useSessionTracking';

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
  
  const { sessionMetrics, currentSession, updateActivity } = useSessionTracking();

  // Calculate adaptive prompt timing based on session patterns
  const calculatePromptTiming = useCallback(() => {
    if (!sessionMetrics) return 5 * 60 * 1000; // Default 5 minutes

    const { averageSessionDuration, totalSessions } = sessionMetrics;
    
    // For new users (< 3 sessions), use shorter intervals to guide them
    if (totalSessions < 3) {
      return 3 * 60 * 1000; // 3 minutes for new users
    }
    
    // For experienced users, adapt based on their typical session duration
    const adaptiveTiming = Math.min(
      averageSessionDuration * 0.25, // 25% of average session duration
      8 * 60 * 1000 // Maximum 8 minutes
    );
    
    return Math.max(adaptiveTiming, 2 * 60 * 1000); // Minimum 2 minutes
  }, [sessionMetrics]);

  // Create or update facilitator session
  const initializeFacilitatorSession = useCallback(async () => {
    if (!userId || !deliberationId || !currentSession) return;

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
              currentSessionId: currentSession.id,
              sessionStartedAt: currentSession.created_at,
              totalSessions: sessionMetrics?.totalSessions || 1,
              averageSessionDuration: sessionMetrics?.averageSessionDuration || 0
            }
          })
          .eq('id', existingSession.id)
          .select()
          .single();

        setFacilitatorSession(updatedSession);
      } else {
        // Create new facilitator session
        const { data: newSession } = await supabase
          .from('facilitator_sessions')
          .insert({
            user_id: userId,
            deliberation_id: deliberationId,
            agent_config_id: '00000000-0000-0000-0000-000000000000', // Default facilitator agent
            session_state: {
              currentSessionId: currentSession.id,
              sessionStartedAt: currentSession.created_at,
              totalSessions: sessionMetrics?.totalSessions || 1,
              averageSessionDuration: sessionMetrics?.averageSessionDuration || 0,
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
  }, [userId, deliberationId, currentSession, sessionMetrics]);

  // Generate enhanced proactive prompt with session context
  const generateEnhancedPrompt = useCallback(async () => {
    if (!enabled || !facilitatorSession || !sessionMetrics) return;

    try {
      logger.info('[EnhancedProactivePrompts] Generating enhanced proactive prompt', { 
        userId, 
        deliberationId,
        sessionContext: {
          totalSessions: sessionMetrics.totalSessions,
          averageSessionDuration: sessionMetrics.averageSessionDuration,
          currentSessionAge: Date.now() - new Date(currentSession?.created_at || 0).getTime()
        }
      });

      // Enhanced session context for AI
      const sessionContext = {
        totalSessions: sessionMetrics.totalSessions,
        averageSessionDuration: sessionMetrics.averageSessionDuration,
        currentSessionAge: Date.now() - new Date(currentSession?.created_at || 0).getTime(),
        isNewUser: sessionMetrics.totalSessions < 3,
        isLongSession: currentSession && (Date.now() - new Date(currentSession.created_at).getTime()) > sessionMetrics.averageSessionDuration,
        promptsSentThisSession: facilitatorSession.session_state?.proactivePromptsCount || 0,
        previousEngagement: facilitatorSession.session_state?.topicsEngaged || []
      };

      const { data, error } = await supabase.functions.invoke('generate-proactive-prompt', {
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
          urgency: sessionContext.isLongSession ? 'high' : 'medium'
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
          promptContext: data.prompt.context,
          sessionAge: sessionContext.currentSessionAge
        });
      }
    } catch (error) {
      logger.error('[EnhancedProactivePrompts] Error generating enhanced proactive prompt', { 
        error, 
        userId, 
        deliberationId 
      });
    }
  }, [enabled, facilitatorSession, sessionMetrics, userId, deliberationId, currentSession]);

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
      const { data, error } = await supabase.functions.invoke('agent-orchestration-stream', {
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
      updateActivity(); // Reset activity tracking
    } catch (error) {
      logger.error('[EnhancedProactivePrompts] Error submitting enhanced proactive prompt response', { 
        error, 
        userId, 
        deliberationId 
      });
    }
  }, [currentPrompt, facilitatorSession, userId, deliberationId, updateActivity]);

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
    if (!enabled || !facilitatorSession || !sessionMetrics) return;

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
  }, [enabled, facilitatorSession, sessionMetrics, calculatePromptTiming, generateEnhancedPrompt]);

  // Initialize facilitator session when dependencies are ready
  useEffect(() => {
    if (userId && deliberationId && currentSession) {
      initializeFacilitatorSession();
    }
  }, [userId, deliberationId, currentSession, initializeFacilitatorSession]);

  return {
    currentPrompt,
    handlePromptResponse,
    handlePromptDismiss: () => setCurrentPrompt(null),
    handlePromptOptOut,
    facilitatorSession,
    isEnabled: enabled && !facilitatorSession?.session_state?.optedOutOfPrompts
  };
};