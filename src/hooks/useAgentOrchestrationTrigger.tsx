import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
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
  ) => {
    const startTime = Date.now();
    
    try {
      onTypingChange?.(true);

      // Start monitoring stream health
      const streamId = streamHealthMonitor.startConnection(messageId);
      
      // Record the operation start
      systemMonitor.recordMetric('agent_orchestration_trigger', 0, true, {
        messageId: messageId.substring(0, 8),
        deliberationId: deliberationId.substring(0, 8),
        mode,
        streamId
      });
      
      logger.info('🤖 Triggering agent orchestration with stream monitoring', { 
        messageId, 
        deliberationId, 
        mode,
        streamId
      });
      
      // Get current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }
      
      logger.info('Triggering agent orchestration', { 
        messageId: messageId.substring(0, 8), 
        deliberationId: deliberationId.substring(0, 8), 
        mode 
      });
      
      // Call agent orchestration stream function with proper timeout
      const functionUrl = `https://iowsxuxkgvpgrvvklwyt.supabase.co/functions/v1/agent-orchestration-stream`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        logger.warn('Agent orchestration timeout');
        streamHealthMonitor.recordDisconnection(streamId, 'timeout');
        controller.abort();
      }, 45000); // Increased to 45 seconds timeout for better reliability
      
      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'
          },
          body: JSON.stringify({
            messageId,
            deliberationId,
            mode
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          streamHealthMonitor.recordDisconnection(streamId, `HTTP ${response.status}`);
          const errorText = await response.text();
          logger.error('❌ Edge function response error', {
            status: response.status,
            statusText: response.statusText,
            errorText: errorText.substring(0, 500),
            messageId,
            streamId
          });
          throw new Error(`Agent orchestration failed: ${response.status} - ${errorText}`);
        }

        logger.info('✅ Stream response received successfully', {
          messageId,
          streamId,
          contentType: response.headers.get('content-type')
        });
        
        const duration = Date.now() - startTime;
        systemMonitor.recordMetric('agent_orchestration_trigger', duration, true, {
          messageId: messageId.substring(0, 8),
          deliberationId: deliberationId.substring(0, 8),
          mode,
          success: true
        });
        
        streamHealthMonitor.endConnection(streamId, 'complete');
        
        logger.info('Agent orchestration triggered successfully', { 
          messageId: messageId.substring(0, 8), 
          deliberationId: deliberationId.substring(0, 8), 
          mode,
          duration,
          streamId
        });
        
        // Set timeout to clear typing indicator if no response in 60 seconds
        setTimeout(() => {
          onTypingChange?.(false);
        }, 60000);
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      systemMonitor.recordMetric('agent_orchestration_trigger', duration, false, {
        messageId: messageId.substring(0, 8),
        deliberationId: deliberationId.substring(0, 8),
        mode,
        error: errorMessage
      });
      
      logger.error('Failed to trigger agent orchestration', error as Error, {
        messageId: messageId.substring(0, 8),
        deliberationId: deliberationId.substring(0, 8),
        mode,
        duration
      });
      
      onTypingChange?.(false);
      
      // User-friendly error handling based on error type
      let userMessage = "Unable to get AI response. Please try again.";
      
      if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
        userMessage = "AI response timed out. Please try again.";
      } else if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
        userMessage = "Authentication error. Please refresh the page and try again.";
      } else if (errorMessage.includes('403')) {
        userMessage = "Access denied. Please check your permissions.";
      } else if (errorMessage.includes('500')) {
        userMessage = "Server error. Please try again in a moment.";
      }
      
      toast({
        title: "Agent Response Failed",
        description: userMessage,
        variant: "destructive"
      });
      
      // Update system health status
      systemMonitor.updateComponentHealth('agentOrchestration', 'warning', errorMessage);
      
      throw error;
    }
  }, [toast]);

  return {
    triggerAgentOrchestration,
  };
};