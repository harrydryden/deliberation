import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/utils/logger";

interface AgentOrchestrationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  performance?: {
    totalTime: number;
    modelUsed: string;
    strategy: string;
  };
}

export function useAgentOrchestrationTrigger() {
  const [isLoading, setIsLoading] = useState(false);

  const triggerAgentResponse = async (
    messageId: string,
    deliberationId: string,
    orchestrationResult?: any,
    messageContent?: string,
    mode: 'chat' | 'learn' = 'chat',
    enhanced = false
  ): Promise<AgentOrchestrationResult> => {
    logger.debug('Starting enhanced agent orchestration trigger', {
      messageId,
      deliberationId,
      hasOrchestrationResult: !!orchestrationResult,
      messageContent: messageContent?.substring(0, 100),
      mode,
      enhanced,
      isLoading
    });

    if (isLoading) {
      logger.debug('Agent orchestration already in progress, skipping');
      return { success: false, error: 'Agent orchestration already in progress' };
    }

    setIsLoading(true);

    try {
      // Step 1: Get orchestration result if not provided
      let finalOrchestrationResult = orchestrationResult;
      
      if (!finalOrchestrationResult) {
        logger.debug('No orchestration result provided, calling agent_orchestration_stream');
        
        const requestBody: any = {
          messageId,
          deliberationId,
          mode,
          enhanced,
          debug: true
        };
        
        if (messageContent) {
          requestBody.message = messageContent;
        }
        
        logger.debug('Calling agent_orchestration_stream with enhanced body:', requestBody);
        
        const { data: orchData, error: orchError } = await supabase.functions.invoke(
          'agent_orchestration_stream',
          {
            body: requestBody
          }
        );

        logger.debug('agent_orchestration_stream result:', {
          data: orchData,
          error: orchError
        });

        if (orchError) {
          logger.error('Orchestration failed:', orchError as Error);
          const errorMessage = orchError.message || orchError.details || JSON.stringify(orchError);
          toast.error(`Orchestration failed: ${errorMessage}`);
          throw new Error(`Orchestration failed: ${errorMessage}`);
        }

        finalOrchestrationResult = orchData;

        if (orchData?.debugInfo) {
          const used = orchData.debugInfo.usedAgentSource || 'unknown';
          const agentName = orchData?.selectedAgent?.name || orchData?.debugInfo?.localAgent?.name || 'Unknown agent';
          toast.message(`Enhanced agent selected: ${agentName} (${used})`);
          logger.info('Enhanced agent orchestration debug:', orchData.debugInfo);
        }
      }

      logger.debug('Calling enhanced generate_agent_response with orchestration result:', finalOrchestrationResult);

      // Step 2: Call enhanced generate_agent_response
      const requestBody: any = {
        orchestrationResult: finalOrchestrationResult,
        messageId,
        deliberationId,
        mode,
        enhanced,
        config: {
          enableParallel: true,
          timeout: 30000,
          fallbackStrategy: 'balanced'
        },
        debug: true
      };
      
      if (messageContent && messageContent.trim().length > 0) {
        requestBody.message = messageContent;
      }
      
      const { data, error } = await supabase.functions.invoke(
        'generate_agent_response',
        {
          body: requestBody
        }
      );

      logger.debug('Enhanced generate_agent_response result:', {
        data,
        error
      });

      if (error) {
        logger.error('Enhanced agent response generation failed:', error as Error);
        const errorMessage = error.message || error.details || JSON.stringify(error);
        toast.error(`Enhanced agent response failed: ${errorMessage}`);
        throw new Error(`Enhanced agent response generation failed: ${errorMessage}`);
      }

      // Enhanced success feedback
      if (data?.performance) {
        const performanceMsg = data.performance.totalTime < 5000 ? ' (Fast)' : 
                              data.performance.totalTime < 10000 ? ' (Normal)' : ' (Slow)';
        const strategyMsg = data.performance.strategy === 'parallel' ? ' [Parallel]' : ' [Sequential]';
        toast.success(`Enhanced agent response generated${performanceMsg}${strategyMsg}`);
      } else {
        toast.success('Enhanced agent response generated successfully');
      }

      logger.info('Enhanced agent orchestration completed successfully');
      return {
        success: true,
        messageId: data?.messageId,
        performance: data?.performance
      };

    } catch (error) {
      logger.error('Enhanced agent orchestration error:', error as Error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Enhanced error feedback
      if (errorMessage.includes('timeout')) {
        toast.error('Enhanced agent response timed out. Try a shorter message.');
      } else if (errorMessage.includes('rate limit')) {
        toast.error('Rate limit exceeded. Please wait a moment before trying again.');
      } else {
        toast.error(`Enhanced agent response failed: ${errorMessage}`);
      }
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      logger.debug('Setting isLoading to false');
      setIsLoading(false);
    }
  };

  return {
    triggerAgentResponse,
    isLoading
  };
}