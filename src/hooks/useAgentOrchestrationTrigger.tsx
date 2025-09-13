import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AgentOrchestrationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export function useAgentOrchestrationTrigger() {
  const [isLoading, setIsLoading] = useState(false);

  const triggerAgentResponse = async (
    messageId: string,
    deliberationId: string,
    orchestrationResult?: any,
    messageContent?: string
  ): Promise<AgentOrchestrationResult> => {
    if (isLoading) {
      return { success: false, error: 'Agent orchestration already in progress' };
    }

    setIsLoading(true);

    try {
      // First, call agent_orchestration_stream to get orchestration data
      let finalOrchestrationResult = orchestrationResult;
      
      if (!finalOrchestrationResult) {
        const requestBody: any = {
          messageId,
          deliberationId
        };
        
        // Include message content if available for better reliability
        if (messageContent) {
          requestBody.message = messageContent;
        }
        
        const { data: orchData, error: orchError } = await supabase.functions.invoke(
          'agent_orchestration_stream',
          {
            body: requestBody
          }
        );

        if (orchError) {
          throw new Error(`Orchestration failed: ${orchError.message}`);
        }

        finalOrchestrationResult = orchData;
      }

      // Then call generate_agent_response with the orchestration result
      const { data, error } = await supabase.functions.invoke(
        'generate_agent_response',
        {
          body: {
            orchestrationResult: finalOrchestrationResult,
            messageId,
            deliberationId,
            message: messageContent
          }
        }
      );

      if (error) {
        throw new Error(`Agent response generation failed: ${error.message}`);
      }

      return {
        success: true,
        messageId: data?.messageId
      };

    } catch (error) {
      console.error('Agent orchestration error:', error);
      toast.error('Failed to trigger agent response');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    triggerAgentResponse,
    isLoading
  };
}