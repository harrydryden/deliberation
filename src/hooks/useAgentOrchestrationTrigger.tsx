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

      // Test connectivity before making the actual request
      logger.info('🔍 [DEBUG] Testing edge function connectivity', {
        requestId,
        url: functionUrl,
        timestamp: new Date().toISOString()
      });
      
      // Quick connectivity test
      try {
        const testResponse = await fetch(functionUrl, {
          method: 'OPTIONS',
          headers: {
            'Origin': window.location.origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization, apikey, content-type'
          }
        });
        
        logger.info('🔍 [DEBUG] Connectivity test result', {
          requestId,
          status: testResponse.status,
          ok: testResponse.ok,
          statusText: testResponse.statusText,
          headers: Object.fromEntries(testResponse.headers.entries())
        });
      } catch (testError) {
        logger.error('🚨 [DEBUG] Connectivity test failed', {
          requestId,
          error: testError,
          message: testError instanceof Error ? testError.message : 'Unknown test error'
        });
        // Continue with main request anyway - connectivity test might fail but main request might work
      }

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
        // CRITICAL: Use console.log directly to ensure logs appear
        console.log('🌐 [SUPABASE-CLIENT-DEBUG] Using Supabase client invoke instead of fetch', {
          requestId,
          functionName: 'agent-orchestration-stream',
          payload: requestPayload,
          timestamp: new Date().toISOString(),
          online: navigator.onLine
        });
        
        logger.info('🌐 [DEBUG] Using Supabase functions.invoke', {
          requestId,
          functionName: 'agent-orchestration-stream',
          payload: requestPayload,
          timestamp: new Date().toISOString()
        });

        // Use Supabase client instead of fetch to avoid proxy issues
        const { data: response, error: invokeError } = await supabase.functions.invoke('agent-orchestration-stream', {
          body: requestPayload,
          headers: {
            'X-Request-ID': requestId
          }
        });
        
        clearTimeout(timeoutId);
        
        if (invokeError) {
          console.error('🚨 [SUPABASE-INVOKE-ERROR] Function invoke failed', {
            requestId,
            error: invokeError,
            message: invokeError.message,
            context: invokeError.context || 'No context'
          });
          throw new Error(`Agent orchestration failed: ${invokeError.message || 'Unknown invoke error'}`);
        }
        
        // PHASE 1: Enhanced Response Logging for Supabase invoke
        console.log('📥 [SUPABASE-RESPONSE] Function invoke succeeded', {
          requestId,
          messageId: messageId.substring(0, 8),
          streamId,
          responseData: response ? 'Data received' : 'No data',
          mode
        });
        
        logger.info('📥 [PHASE1] Received orchestration response via Supabase client', {
          requestId,
          messageId: messageId.substring(0, 8),
          streamId,
          hasData: !!response,
          mode
        });

        logger.info('✅ [PHASE1] Stream response received successfully via Supabase client', {
          requestId,
          messageId: messageId.substring(0, 8),
          streamId,
          mode,
          success: true
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
        
      } catch (invokeError) {
        clearTimeout(timeoutId);
        streamHealthMonitor.recordDisconnection(streamId, 'supabase_invoke_error');
        
        // CRITICAL: Use console.error directly to ensure error logs appear
        console.error('🚨 [SUPABASE-INVOKE-ERROR] Supabase function invoke failed:', {
          requestId,
          error: invokeError,
          errorMessage: invokeError instanceof Error ? invokeError.message : 'Unknown invoke error',
          errorName: invokeError instanceof Error ? invokeError.name : 'Unknown',
          errorStack: invokeError instanceof Error ? invokeError.stack?.substring(0, 500) : 'No stack',
          functionName: 'agent-orchestration-stream',
          timestamp: new Date().toISOString(),
          networkState: navigator.onLine,
          connectionType: (navigator as any).connection?.effectiveType || 'unknown'
        });
        
        logger.error('🚨 [DEBUG] Supabase invoke error details', {
          requestId,
          error: invokeError,
          errorMessage: invokeError instanceof Error ? invokeError.message : 'Unknown invoke error',
          errorName: invokeError instanceof Error ? invokeError.name : 'Unknown',
          errorStack: invokeError instanceof Error ? invokeError.stack?.substring(0, 500) : 'No stack',
          functionName: 'agent-orchestration-stream',
          timestamp: new Date().toISOString(),
          networkState: navigator.onLine,
          connectionType: (navigator as any).connection?.effectiveType || 'unknown'
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
      
      // Update system health status
      systemMonitor.updateComponentHealth('agentOrchestration', 'warning', errorMessage);
      
      throw error;
    }
  }, [toast]);

  return {
    triggerAgentOrchestration,
  };
};