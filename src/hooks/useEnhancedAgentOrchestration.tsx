import { useState, useCallback, useRef } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/utils/logger";

interface EnhancedAgentResult {
  success: boolean;
  messageId?: string;
  error?: string;
  performance?: {
    totalTime: number;
    orchestrationTime: number;
    generationTime: number;
    modelUsed: string;
  };
}

interface RequestConfig {
  enableParallel?: boolean;
  timeout?: number;
  fallbackStrategy?: 'fast' | 'quality' | 'balanced';
}

export function useEnhancedAgentOrchestration() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const triggerEnhancedResponse = useCallback(async (
    messageId: string,
    deliberationId: string,
    messageContent?: string,
    mode: 'chat' | 'learn' = 'chat',
    config: RequestConfig = {}
  ): Promise<EnhancedAgentResult> => {
    const startTime = Date.now();
    const requestId = `${messageId}-${Date.now()}`;
    
    logger.debug('Starting enhanced orchestration', {
      requestId,
      messageId,
      deliberationId,
      config,
      mode
    });

    // Prevent concurrent requests
    if (isLoading && currentRequest !== requestId) {
      logger.debug('Concurrent request blocked');
      return { 
        success: false, 
        error: 'Another agent request is already in progress' 
      };
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Setup new abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setCurrentRequest(requestId);

    try {
      // Step 1: Enhanced Orchestration
      const orchestrationStart = Date.now();
      logger.debug('Starting orchestration phase');

      const orchestrationBody = {
        messageId,
        deliberationId,
        mode,
        message: messageContent,
        enhanced: true,
        config: {
          enableParallel: config.enableParallel ?? true,
          fallbackStrategy: config.fallbackStrategy ?? 'balanced',
          timeout: config.timeout ?? 30000
        }
      };

      const { data: orchestrationResult, error: orchError } = await supabase.functions.invoke(
        'agent_orchestration_stream',
        {
          body: orchestrationBody,
          // Add timeout handling
          headers: {
            'X-Request-ID': requestId
          }
        }
      );

      if (controller.signal.aborted) {
        throw new Error('Request was cancelled');
      }

      if (orchError) {
        logger.error('Orchestration failed:', orchError as Error);
        throw new Error(`Orchestration failed: ${orchError.message}`);
      }

      const orchestrationTime = Date.now() - orchestrationStart;
      logger.debug('Orchestration completed', {
        time: orchestrationTime,
        agent: orchestrationResult?.selectedAgent?.name
      });

      // Step 2: Enhanced Generation
      const generationStart = Date.now();
      logger.debug('Starting generation phase');

      const generationBody = {
        orchestrationResult,
        messageId,
        deliberationId,
        mode,
        message: messageContent,
        enhanced: true,
        config: {
          ...config,
          requestId,
          enableParallel: config.enableParallel ?? true
        }
      };

      const { data: generationResult, error: genError } = await supabase.functions.invoke(
        'generate_agent_response',
        {
          body: generationBody,
          headers: {
            'X-Request-ID': requestId
          }
        }
      );

      if (controller.signal.aborted) {
        throw new Error('Request was cancelled');
      }

      if (genError) {
        logger.error('Generation failed:', genError as Error);
        throw new Error(`Generation failed: ${genError.message}`);
      }

      const generationTime = Date.now() - generationStart;
      const totalTime = Date.now() - startTime;

      logger.info('Enhanced orchestration completed successfully', {
        totalTime,
        orchestrationTime,
        generationTime,
        modelUsed: generationResult?.performance?.modelUsed
      });

      // Show success feedback with performance info
      const agentName = orchestrationResult?.selectedAgent?.name || 'Agent';
      const performanceMsg = totalTime < 5000 ? ' (Fast)' : totalTime < 10000 ? ' (Normal)' : ' (Slow)';
      toast.success(`${agentName} responded${performanceMsg}`);

      return {
        success: true,
        messageId: generationResult?.messageId,
        performance: {
          totalTime,
          orchestrationTime,
          generationTime,
          modelUsed: generationResult?.performance?.modelUsed || 'unknown'
        }
      };

    } catch (error) {
      if (controller.signal.aborted) {
        logger.debug('Request was cancelled');
        return {
          success: false,
          error: 'Request was cancelled'
        };
      }

      logger.error('Enhanced orchestration error:', error as Error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Enhanced error handling with fallback suggestion
      if (errorMessage.includes('timeout')) {
        toast.error('Agent response timed out. Try a shorter message.');
      } else if (errorMessage.includes('rate limit')) {
        toast.error('Rate limit exceeded. Please wait a moment.');
      } else {
        toast.error(`Agent error: ${errorMessage}`);
      }
      
      return {
        success: false,
        error: errorMessage
      };

    } finally {
      setIsLoading(false);
      setCurrentRequest(null);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [isLoading, currentRequest]);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      logger.debug('Cancelling current request');
      abortControllerRef.current.abort();
      toast.info('Agent request cancelled');
    }
  }, []);

  const retryLastRequest = useCallback(() => {
    // This would need to store last request parameters
    logger.debug('Retry functionality not implemented yet');
    toast.info('Retry functionality coming soon');
  }, []);

  return {
    triggerEnhancedResponse,
    cancelRequest,
    retryLastRequest,
    isLoading,
    currentRequest
  };
}