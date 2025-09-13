import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { productionLogger } from '@/utils/productionLogger';
import { useToast } from '@/hooks/use-toast';
import { systemMonitor } from '@/services/system-monitoring.service';
import { streamHealthMonitor } from '@/utils/streamHealthMonitor';

/**
 * Dedicated hook for triggering agent orchestration and response generation
 * Centralizes the two-phase agent processing with proper error handling and monitoring
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
    
    // Enhanced status tracking for two-phase processing
    let currentPhase = 'INITIALIZING';
    
    try {
      // Set typing indicator and initial status
      onTypingChange?.(true);

      // ============================================================================
      // PHASE 1: AGENT ORCHESTRATION
      // ============================================================================
      currentPhase = 'ORCHESTRATION';
      logger.debug(`�� [PHASE 1] Starting agent orchestration for message ${messageId} in deliberation ${deliberationId}`);
      
      const { data: orchestrationData, error: orchestrationError } = await supabase.functions.invoke('agent_orchestration_stream', {
        body: { 
          messageId, 
          deliberationId,
          mode 
        }
      });

      if (orchestrationError) {
        throw new Error(`Orchestration failed: ${orchestrationError.message}`);
      }

      logger.debug(`✅ [PHASE 1] Orchestration completed, selected agent: ${orchestrationData.selectedAgent.type}`);

      // ============================================================================
      // PHASE 2: AGENT RESPONSE GENERATION
      // ============================================================================
      currentPhase = 'RESPONSE_GENERATION';
      logger.debug(`🤖 [PHASE 2] Starting response generation with ${orchestrationData.selectedAgent.type}`);

      const { data: responseData, error: responseError } = await supabase.functions.invoke('generate_agent_response', {
        body: {
          orchestrationResult: orchestrationData,
          messageId,
          deliberationId,
          mode
        }
      });

      if (responseError) {
        throw new Error(`Response generation failed: ${responseError.message}`);
      }

      currentPhase = 'COMPLETED';
      const duration = Date.now() - startTime;

      logger.debug(`🎉 [PHASE 2] Response generation completed in ${duration}ms`);

      // Enhanced success feedback
      const agentName = responseData?.agent?.name || responseData?.agent?.type || 'Agent';
      const responseLength = responseData?.metadata?.responseLength || responseData?.agentMessage?.content?.length || 0;
      
      toast({
        title: "Agent Response Generated",
        description: `${agentName} responded (${responseLength} chars) in ${duration}ms`,
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      productionLogger.error(`Agent processing failed in ${currentPhase}`, error);
      
      // Enhanced error handling based on phase and error type
      let errorMessage = 'Failed to generate agent response';
      let errorTitle = 'Agent Response Error';
      
      if (currentPhase === 'ORCHESTRATION') {
        errorMessage = 'Failed to select appropriate agent. Please try again.';
        errorTitle = 'Agent Selection Error';
      } else if (currentPhase === 'RESPONSE_GENERATION') {
        errorMessage = 'Failed to generate response. Please try again.';
        errorTitle = 'Response Generation Error';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Agent response timed out after 45 seconds. Please try again.';
        errorTitle = 'Response Timeout';
      } else if (error.message?.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
        errorTitle = 'Network Error';
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
    } finally {
      // Always clear typing indicator
      onTypingChange?.(false);
      logger.debug(`�� [TRIGGER] Agent processing completed (final phase: ${currentPhase})`);
    }
  }, [toast]);

  return {
    triggerAgentOrchestration,
  };
};