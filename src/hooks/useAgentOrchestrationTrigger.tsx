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
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      onTypingChange?.(true);

      // Enhanced mode validation
      logger.info('🔍 [PHASE1] Mode parameter validation', {
        messageId: messageId.substring(0, 8),
        deliberationId: deliberationId.substring(0, 8),
        mode,
        requestId,
        validModes: ['chat', 'learn'],
        isValidMode: ['chat', 'learn'].includes(mode)
      });

      if (!mode || !['chat', 'learn'].includes(mode)) {
        logger.warn('⚠️ [PHASE1] Invalid mode parameter detected', {
          mode,
          defaulting: 'chat',
          requestId
        });
      }

      // Start monitoring stream health
      const streamId = streamHealthMonitor.startConnection(messageId);
      
      // Record the operation start
      systemMonitor.recordMetric('agent_orchestration_trigger', 0, true, {
        messageId: messageId.substring(0, 8),
        deliberationId: deliberationId.substring(0, 8),
        mode,
        streamId,
        requestId
      });
      
      logger.info('🤖 Triggering agent orchestration with stream monitoring', { 
        messageId, 
        deliberationId, 
        mode,
        streamId,
        requestId
      });

      // Use standard Supabase client invocation
      const requestPayload = {
        messageId,
        deliberationId,
        mode: mode || 'chat'
      };

      logger.info('📤 [PHASE1] Preparing orchestration request', {
        requestId,
        messageId: messageId.substring(0, 8),
        deliberationId: deliberationId.substring(0, 8),
        mode: requestPayload.mode,
        streamId,
        payloadSize: JSON.stringify(requestPayload).length
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        logger.warn('⏰ [PHASE1] Agent orchestration timeout', { requestId, timeout: '45s' });
        streamHealthMonitor.recordDisconnection(streamId, 'timeout');
        controller.abort();
      }, 45000);
      
      try {
        console.log('🌐 [DEBUG] Using Supabase functions.invoke (standard pattern)', {
          requestId,
          functionName: 'agent-orchestration-stream',
          payload: requestPayload,
          timestamp: new Date().toISOString()
        });

        // Use supabase.functions.invoke like all other working functions
        const result = await supabase.functions.invoke('agent-orchestration-stream', {
          body: requestPayload,
          headers: {
            'X-Request-ID': requestId
          }
        });
        
        clearTimeout(timeoutId);
        
        const response = result.data;
        const invokeError = result.error;
        
        if (invokeError) {
          console.error('🚨 [SUPABASE-INVOKE-ERROR] Function invoke failed', {
            requestId,
            error: invokeError,
            message: invokeError.message,
            context: invokeError.context || 'No context',
            details: invokeError
          });
          throw new Error(`Agent orchestration failed: ${invokeError.message || 'Unknown invoke error'}`);
        }
        
        console.log('📥 [SUPABASE-RESPONSE] Function invoke succeeded', {
          requestId,
          messageId: messageId.substring(0, 8),
          streamId,
          responseData: response ? 'Data received' : 'No data',
          mode: requestPayload.mode
        });
        
        logger.info('📥 [PHASE1] Received orchestration response via Supabase client', {
          requestId,
          messageId: messageId.substring(0, 8),
          streamId,
          hasData: !!response,
          mode: requestPayload.mode
        });
        
        const duration = Date.now() - startTime;
        systemMonitor.recordMetric('agent_orchestration_trigger', duration, true, {
          messageId: messageId.substring(0, 8),
          deliberationId: deliberationId.substring(0, 8),
          mode: requestPayload.mode,
          success: true
        });
        
        streamHealthMonitor.endConnection(streamId, 'complete');
        
        logger.info('Agent orchestration triggered successfully', { 
          messageId: messageId.substring(0, 8), 
          deliberationId: deliberationId.substring(0, 8), 
          mode: requestPayload.mode,
          duration,
          streamId
        });
        
        // Set timeout to clear typing indicator if no response in 60 seconds
        setTimeout(() => {
          onTypingChange?.(false);
        }, 60000);
        
      } catch (invokeError) {
        clearTimeout(timeoutId);
        streamHealthMonitor.recordDisconnection(streamId, 'supabase_invoke_error');
        
        console.error('🚨 [SUPABASE-INVOKE-ERROR] Supabase function invoke failed:', {
          requestId,
          error: invokeError,
          errorMessage: invokeError instanceof Error ? invokeError.message : 'Unknown invoke error',
          errorName: invokeError instanceof Error ? invokeError.name : 'Unknown',
          errorStack: invokeError instanceof Error ? invokeError.stack?.substring(0, 500) : 'No stack',
          functionName: 'agent-orchestration-stream',
          timestamp: new Date().toISOString(),
          networkState: navigator.onLine
        });
        
        throw invokeError;
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
      
      systemMonitor.updateComponentHealth('agentOrchestration', 'warning', errorMessage);
      
      throw error;
    }
  }, [toast]);

  return {
    triggerAgentOrchestration,
  };
};