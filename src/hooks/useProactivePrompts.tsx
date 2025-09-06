import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface ProactivePrompt {
  question: string;
  context: string;
  deliberationId: string;
}

interface UseProactivePromptsOptions {
  userId: string;
  deliberationId: string;
  enabled?: boolean;
  inactivityTimeout?: number; // milliseconds
}

export const useProactivePrompts = ({
  userId,
  deliberationId,
  enabled = true,
  inactivityTimeout = 5 * 60 * 1000 // 5 minutes
}: UseProactivePromptsOptions) => {
  const [currentPrompt, setCurrentPrompt] = useState<ProactivePrompt | null>(null);
  const [hasShownPromptThisSession, setHasShownPromptThisSession] = useState(false);
  
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionKeyRef = useRef<string>(`proactive_prompt_${userId}_${Date.now()}`);

  // Track user activity
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Only set new timeout if enabled and haven't shown prompt this session
    if (enabled && !hasShownPromptThisSession) {
      timeoutRef.current = setTimeout(() => {
        generateProactivePrompt();
      }, inactivityTimeout);
    }
  }, [enabled, hasShownPromptThisSession, inactivityTimeout]);

  // Generate contextual proactive prompt
  const generateProactivePrompt = useCallback(async () => {
    if (hasShownPromptThisSession || !enabled) return;

    try {
      logger.info('[ProactivePrompts] Generating proactive prompt', { 
        userId, 
        deliberationId,
        inactivityDuration: Date.now() - lastActivityRef.current 
      });

      // Call edge function to generate contextual prompt
      const { data, error } = await supabase.functions.invoke('generate-proactive-prompt', {
        body: {
          userId,
          deliberationId,
          sessionContext: {
            lastActivity: lastActivityRef.current,
            sessionKey: sessionKeyRef.current
          }
        }
      });

      if (error) {
        throw new Error(`Failed to generate proactive prompt: ${error.message}`);
      }

      if (data?.prompt) {
        setCurrentPrompt({
          question: data.prompt.question,
          context: data.prompt.context || 'engagement',
          deliberationId
        });
        setHasShownPromptThisSession(true);

        logger.info('[ProactivePrompts] Proactive prompt generated and shown', { 
          userId, 
          deliberationId,
          context: data.prompt.context 
        });
      }
    } catch (error) {
      logger.error('[ProactivePrompts] Error generating proactive prompt', { 
        error, 
        userId, 
        deliberationId 
      });
    }
  }, [userId, deliberationId, hasShownPromptThisSession, enabled]);

  // Handle user response to proactive prompt
  const handlePromptResponse = useCallback(async (response: string) => {
    if (!currentPrompt) return;

    try {
      logger.info('[ProactivePrompts] User responded to proactive prompt', { 
        userId, 
        deliberationId,
        responseLength: response.length 
      });

      // Submit response as a regular message
      const { error } = await supabase.from('messages').insert({
        content: response,
        message_type: 'user',
        user_id: userId,
        deliberation_id: deliberationId,
        agent_context: {
          triggered_by: 'proactive_prompt',
          prompt_context: currentPrompt.context
        }
      });

      if (error) {
        throw new Error(`Failed to submit proactive prompt response: ${error.message}`);
      }

      setCurrentPrompt(null);
      recordActivity(); // Reset activity tracking
    } catch (error) {
      logger.error('[ProactivePrompts] Error submitting proactive prompt response', { 
        error, 
        userId, 
        deliberationId 
      });
    }
  }, [currentPrompt, userId, deliberationId, recordActivity]);

  // Handle dismissing the prompt
  const handlePromptDismiss = useCallback(() => {
    logger.info('[ProactivePrompts] Proactive prompt dismissed', { userId, deliberationId });
    setCurrentPrompt(null);
    recordActivity(); // Reset activity tracking
  }, [userId, deliberationId, recordActivity]);

  // Handle opting out of proactive prompts for this session
  const handlePromptOptOut = useCallback(() => {
    logger.info('[ProactivePrompts] User opted out of proactive prompts', { userId, deliberationId });
    setCurrentPrompt(null);
    setHasShownPromptThisSession(true); // Prevent further prompts this session
    
    // Store opt-out preference in sessionStorage
    sessionStorage.setItem(`proactive_prompts_disabled_${userId}`, 'true');
  }, [userId, deliberationId]);

  // Check for existing opt-out preference
  useEffect(() => {
    const isDisabled = sessionStorage.getItem(`proactive_prompts_disabled_${userId}`) === 'true';
    if (isDisabled) {
      setHasShownPromptThisSession(true);
    }
  }, [userId]);

  // Initialize activity tracking
  useEffect(() => {
    recordActivity();

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [recordActivity]);

  // Reset session tracking when deliberation changes
  useEffect(() => {
    sessionKeyRef.current = `proactive_prompt_${userId}_${Date.now()}`;
    setHasShownPromptThisSession(false);
    setCurrentPrompt(null);
    
    // Check for opt-out preference for new deliberation
    const isDisabled = sessionStorage.getItem(`proactive_prompts_disabled_${userId}`) === 'true';
    if (isDisabled) {
      setHasShownPromptThisSession(true);
    }
  }, [deliberationId, userId]);

  return {
    currentPrompt,
    recordActivity,
    handlePromptResponse,
    handlePromptDismiss,
    handlePromptOptOut,
    isEnabled: enabled && !hasShownPromptThisSession
  };
};