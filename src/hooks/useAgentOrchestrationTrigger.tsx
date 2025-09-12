import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { productionLogger } from '@/utils/productionLogger';
import { useToast } from '@/hooks/use-toast';
import { systemMonitor } from '@/services/system-monitoring.service';
import { streamHealthMonitor } from '@/utils/streamHealthMonitor';

/**
 * Dedicated hook for triggering agent orchestration
 * Centralizes the agent trigger logic with proper error handling and monitoring
 */
export const useAgentOrchestrationTrigger = () => {
  const { toast } = useToast();

  const triggerAgentOrchestration = useCallback(async (
    messageId: string,
    deliberationId: string,
    mode: 'chat' | 'learn' = 'chat',
    onTypingChange?: (isTyping: boolean) => void
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Enhanced status tracking
    let currentPhase = 'INITIALIZING';
    
    try {
      // Set typing indicator and initial status
      onTypingChange?.(true);
      currentPhase = 'CALLING_EDGE_FUNCTION';
      
      logger.debug(`🚀 [TRIGGER] Starting agent orchestration for message ${messageId} in deliberation ${deliberationId}`);
      logger.debug(`📡 [TRIGGER] Calling agent-orchestration-stream function`);
      
      // Enhanced function call with timeout
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), 45000); // 45 second timeout
      
      const { data, error } = await supabase.functions.invoke('agent_orchestration_stream', {
        body: { 
          messageId, 
          deliberationId,
          mode 
        }
      });

      clearTimeout(timeoutId);
      currentPhase = 'PROCESSING_RESPONSE';
      
      const duration = Date.now() - startTime;
      
      if (error) {
        productionLogger.error(`Agent orchestration failed in ${currentPhase}`, error);
        
        // Enhanced error handling based on error type
        let errorMessage = 'Failed to generate agent response';
        let errorTitle = 'Agent Response Failed';
        
        if (error.message?.includes('timeout') || error.message?.includes('aborted')) {
          errorMessage = 'Agent response timed out. Please try again.';
          errorTitle = 'Response Timeout';
        } else if (error.message?.includes('OpenAI')) {
          errorMessage = 'AI service temporarily unavailable. Please try again.';
          errorTitle = 'AI Service Error';
        } else if (error.message?.includes('authentication') || error.message?.includes('authorization')) {
          errorMessage = 'Authentication error. Please refresh and try again.';
          errorTitle = 'Authentication Error';
        } else if (error.message?.includes('agent')) {
          errorMessage = 'No active agents found for this deliberation.';
          errorTitle = 'Agent Configuration Error';
        }
        
        toast({
          variant: "destructive",
          title: errorTitle,
          description: errorMessage,
        });
        return;
      }

      currentPhase = 'COMPLETED';
      logger.debug(`✅ [TRIGGER] Agent orchestration completed in ${duration}ms:`, data);
      
      // Enhanced success feedback
      const agentName = data?.agentName || data?.agentType || 'Agent';
      const responseLength = data?.responseLength || 0;
      
      toast({
        title: "Agent Response Generated",
        description: `${agentName} responded (${responseLength} chars) in ${duration}ms`,
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      productionLogger.error(`Agent orchestration error in ${currentPhase}`, error);
      
      // Handle specific error types
      let errorMessage = 'Failed to generate agent response';
      let errorTitle = 'Agent Response Error';
      
      if (error.name === 'AbortError') {
        errorMessage = 'Agent response timed out after 45 seconds. Please try again.';
        errorTitle = 'Response Timeout';
      } else if (error.message?.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
        errorTitle = 'Network Error';
      }
      
      toast({
        variant: "destructive",
        title: errorTitle,
        description: errorMessage,
      });
    } finally {
      // Always clear typing indicator
      onTypingChange?.(false);
      logger.debug(`🏁 [TRIGGER] Agent orchestration trigger completed (final phase: ${currentPhase})`);
    }
  }, [toast]);

  return {
    triggerAgentOrchestration,
  };
};