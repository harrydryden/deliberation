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

      // PHASE 1: Enhanced Mode Parameter Validation and Logging
      logger.info('🔍 [PHASE1] Mode parameter validation', {
        messageId: messageId.substring(0, 8),
        deliberationId: deliberationId.substring(0, 8),
        mode,
        modeType: typeof mode,
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
      
      // Get current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }
      
      // PHASE 1: Detailed Request Preparation Logging
      const requestPayload = {
        messageId,
        deliberationId,
        mode
      };

      const functionUrl = `https://iowsxuxkgvpgrvvklwyt.supabase.co/functions/v1/agent-orchestration-stream`;

      logger.info('📤 [PHASE1] Preparing orchestration request', {
        requestId,
        url: functionUrl,
        method: 'POST',
        messageId: messageId.substring(0, 8),
        deliberationId: deliberationId.substring(0, 8),
        mode,
        streamId,
        payloadString: JSON.stringify(requestPayload),
        payloadSize: JSON.stringify(requestPayload).length,
        hasAuthToken: !!session.access_token,
        tokenLength: session.access_token?.length || 0
      });

      // PHASE 1: Request Body Validation Before Send
      if (!requestPayload.messageId || !requestPayload.deliberationId) {
        logger.error('🚨 [PHASE1] Critical request validation failed', {
          requestId,
          hasMessageId: !!requestPayload.messageId,
          hasDeliberationId: !!requestPayload.deliberationId,
          mode: requestPayload.mode
        });
        throw new Error('Missing required parameters for orchestration request');
      }

      const requestHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM',
        'X-Request-ID': requestId  // Add correlation ID
      };

      logger.info('🚀 [PHASE1] Sending orchestration request', {
        requestId,
        timestamp: new Date().toISOString(),
        headers: Object.keys(requestHeaders),
        payloadMode: requestPayload.mode,
        targetFunction: 'agent-orchestration-stream'
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        logger.warn('⏰ [PHASE1] Agent orchestration timeout', { requestId, timeout: '45s' });
        streamHealthMonitor.recordDisconnection(streamId, 'timeout');
        controller.abort();
      }, 45000);
      
      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // PHASE 1: Enhanced Response Logging
        logger.info('📥 [PHASE1] Received orchestration response', {
          requestId,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          url: response.url,
          type: response.type,
          ok: response.ok,
          redirected: response.redirected
        });
        
        if (!response.ok) {
          streamHealthMonitor.recordDisconnection(streamId, `HTTP ${response.status}`);
          
          let errorText = '';
          try {
            errorText = await response.text();
          } catch (textError) {
            logger.warn('🚨 [PHASE1] Could not read error response body', { requestId, textError });
            errorText = 'Unable to read error response';
          }

          logger.error('❌ [PHASE1] Edge function response error', {
            requestId,
            status: response.status,
            statusText: response.statusText,
            errorText: errorText.substring(0, 500),
            messageId: messageId.substring(0, 8),
            streamId,
            mode,
            responseHeaders: Object.fromEntries(response.headers.entries())
          });
          throw new Error(`Agent orchestration failed: ${response.status} - ${errorText}`);
        }

        logger.info('✅ [PHASE1] Stream response received successfully', {
          requestId,
          messageId: messageId.substring(0, 8),
          streamId,
          contentType: response.headers.get('content-type'),
          mode,
          responseOk: response.ok
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