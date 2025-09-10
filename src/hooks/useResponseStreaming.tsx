import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { productionLogger } from '@/utils/productionLogger';
import { useNetworkPerformanceTracker } from './useNetworkPerformanceTracker';
import { useStreamHealthMonitor } from './useStreamHealthMonitor';
import { useGracefulFallback } from './useGracefulFallback';

interface StreamingState {
  isStreaming: boolean;
  currentMessage: string;
  messageId: string | null;
  agentType: string | null;
  retryCount: number;
  lastError: string | null;
  canRetry: boolean;
}

interface StreamingResponse {
  content: string;
  done: boolean;
  messageId?: string;
  agentType?: string;
  error?: string;
}

interface StreamRecoveryConfig {
  maxRetries: number;
  retryDelay: number;
  timeoutMs: number;
  heartbeatIntervalMs: number;
  stalledConnectionMs: number;
}

const DEFAULT_RECOVERY_CONFIG: StreamRecoveryConfig = {
  maxRetries: 3,
  retryDelay: 2000,
  timeoutMs: 45000,
  heartbeatIntervalMs: 5000,
  stalledConnectionMs: 25000,
};

export const useResponseStreaming = () => {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    currentMessage: '',
    messageId: null,
    agentType: null,
    retryCount: 0,
    lastError: null,
    canRetry: false,
  });

  const streamControllerRef = useRef<AbortController | null>(null);
  const accumulatorRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  const startTime = useRef<number>(0);
  const networkTracker = useNetworkPerformanceTracker();
  const healthMonitor = useStreamHealthMonitor();
  const gracefulFallback = useGracefulFallback();
  const recoveryConfigRef = useRef<StreamRecoveryConfig>(DEFAULT_RECOVERY_CONFIG);

  // Enhanced cleanup with health monitoring
  useEffect(() => {
    return () => {
      productionLogger.debug('ResponseStreaming component unmounting - cleaning up');
      
      healthMonitor.stopHealthMonitoring();
      
      // Abort any active streaming
      if (streamControllerRef.current) {
        try {
          streamControllerRef.current.abort();
        } catch (error) {
          productionLogger.warn('Error aborting stream on unmount', error);
        }
        streamControllerRef.current = null;
      }
      
      // Clear RAF callbacks
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      
      // Clear refs
      accumulatorRef.current = '';
    };
  }, [healthMonitor]);

  // Enhanced stream recovery with automatic retry
  const startStreamingWithRecovery = useCallback(async (
    messageId: string,
    deliberationId: string,
    onUpdate: (content: string, messageId: string, agentType: string | null) => void,
    onComplete: (finalContent: string, messageId: string, agentType: string | null) => void,
    onError: (error: string) => void,
    mode: 'chat' | 'learn' = 'chat',
    retryAttempt: number = 0
  ) => {
    const config = recoveryConfigRef.current;
    productionLogger.debug('Starting streaming for message', { 
      messageId, 
      retryAttempt, 
      maxRetries: config.maxRetries 
    });
    
    // Start performance tracking and health monitoring
    startTime.current = Date.now();
    
    // Start health monitoring with auto-recovery
    healthMonitor.startHealthMonitoring(() => {
      productionLogger.warn('Health monitor detected stream stall, triggering recovery');
      if (streamControllerRef.current) {
        streamControllerRef.current.abort();
      }
    });
    
    // Cleanup any previous RAF callbacks to prevent memory leaks
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    
    // Reset previous state
    if (retryAttempt === 0) {
      accumulatorRef.current = '';
    }
    
    setStreamingState({
      isStreaming: true,
      currentMessage: accumulatorRef.current,
      messageId,
      agentType: null,
      retryCount: retryAttempt,
      lastError: null,
      canRetry: retryAttempt < config.maxRetries,
    });

    // Cancel any existing stream
    if (streamControllerRef.current) {
      try {
        streamControllerRef.current.abort();
      } catch (error) {
        productionLogger.warn('Error aborting previous stream', error);
      }
    }

    streamControllerRef.current = new AbortController();
    
    const timeoutId = setTimeout(() => {
      productionLogger.warn('Main streaming timeout reached', { 
        timeoutMs: config.timeoutMs, 
        retryAttempt 
      });
      
      if (streamControllerRef.current) {
        try {
          streamControllerRef.current.abort();
        } catch (error) {
          productionLogger.warn('Error aborting on timeout', error);
        }
      }
    }, config.timeoutMs);

    try {
      productionLogger.debug('Checking if streaming is already in progress');
      
      // Check if this message is already streaming
      const isAlreadyStreaming = streamingState.isStreaming && streamingState.messageId === messageId;
      if (isAlreadyStreaming) {
        productionLogger.warn('Message already streaming, skipping');
            setStreamingState({
              isStreaming: false,
              currentMessage: '',
              messageId: null,
              agentType: null,
              retryCount: 0,
              lastError: null,
              canRetry: false,
            });
        return;
      }

      productionLogger.debug('Proceeding to streaming function call');

      // Consistent session-based auth for streaming API calls
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      productionLogger.debug('Using optimized streaming function call');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (currentSession?.access_token) {
        headers['Authorization'] = `Bearer ${currentSession.access_token}`;
      }
      
      // CRITICAL FIX: Use fetch for streaming instead of supabase.functions.invoke
      // The supabase SDK doesn't properly handle streaming responses
      const functionUrl = `https://iowsxuxkgvpgrvvklwyt.supabase.co/functions/v1/agent-orchestration-stream`;
      
      // Simplified, robust headers for edge function calls
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'
      };
      
      if (currentSession?.access_token) {
        requestHeaders['Authorization'] = `Bearer ${currentSession.access_token}`;
        productionLogger.debug('Added authorization header to request');
      } else {
        productionLogger.warn('No access token available for request');
      }
      
      productionLogger.debug('Making request to streaming function', { functionUrl, messageId, deliberationId });
      
      // Track network request
      const networkId = networkTracker.startTracking(functionUrl, 'POST', 'stream');
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          messageId,
          deliberationId,
          mode
        }),
        signal: streamControllerRef.current?.signal
      });
      
      productionLogger.debug('Response received', { status: response.status, statusText: response.statusText });
      
      if (!response.ok) {
        // Log response body for debugging
        let errorBody = '';
        try {
          errorBody = await response.text();
          productionLogger.error('Error response body', errorBody);
        } catch (e) {
          productionLogger.error('Could not read error response body', e);
        }
        throw new Error(`Edge function failed with status ${response.status}: ${response.statusText}. Body: ${errorBody}`);
      }

      productionLogger.debug('Streaming response received successfully');
      
      // Record first response received
      networkTracker.endTracking(networkId, response.status);
      productionLogger.debug('First chunk received', { messageId });

      if (!response.body) {
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      productionLogger.debug('Starting to read stream');

      const updateUI = () => {
        setStreamingState(prev => ({
          ...prev,
          currentMessage: accumulatorRef.current,
        }));
        onUpdate(accumulatorRef.current, messageId, streamingState.agentType);
      };

      while (true) {
        try {
          const { done, value } = await reader.read();
          
          if (streamControllerRef.current?.signal?.aborted) {
            productionLogger.debug('Stream aborted by user');
            await reader.cancel();
            break;
          }

          if (done) {
            productionLogger.debug('Stream completed');
            break;
          }

            try {
              const chunk = decoder.decode(value, { stream: true });
              healthMonitor.recordActivity(chunk.length);
              
              productionLogger.debug('Received chunk', { 
                chunkLength: chunk.length,
                healthStats: healthMonitor.getHealthStats()
              });

              // Parse each line as a potential JSON object
              const lines = chunk.split('\n').filter(line => line.trim());
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6);
                  if (jsonStr === '[DONE]') {
                    productionLogger.debug('Received [DONE] signal');
                    break;
                  }
                  
                  try {
                    const parsed: StreamingResponse = JSON.parse(jsonStr);
                    
                    if (parsed.error) {
                      throw new Error(parsed.error);
                    }
                    
                    if (parsed.content) {
                      accumulatorRef.current += parsed.content;
                      healthMonitor.recordActivity();
                      
                      // Update agent type if provided
                      if (parsed.agentType && !streamingState.agentType) {
                        setStreamingState(prev => ({
                          ...prev,
                          agentType: parsed.agentType || null,
                        }));
                      }
                      
                      // Throttle UI updates using requestAnimationFrame
                      if (rafIdRef.current) {
                        cancelAnimationFrame(rafIdRef.current);
                      }
                      rafIdRef.current = requestAnimationFrame(updateUI);
                    }
                    
                    if (parsed.done) {
                      productionLogger.debug('Received done signal from parsed data');
                      break;
                    }
                  } catch (parseError) {
                    productionLogger.warn('Failed to parse streaming chunk', parseError);
                    // Continue processing other lines
                  }
                }
              }
            } catch (chunkError) {
              productionLogger.error('Error processing chunk', chunkError);
              // Continue processing stream
            }
        } catch (readError) {
          // Handle specific abort errors gracefully
          if (readError instanceof DOMException && readError.name === 'AbortError') {
            productionLogger.debug('Stream reading aborted intentionally');
            await reader.cancel();
            return; // Exit early without calling onError
          }
          throw readError; // Re-throw other errors
        }
      }

      // Final update
      updateUI();
      onComplete(accumulatorRef.current, messageId, streamingState.agentType);
      
      // Record successful completion and stop health monitoring
      healthMonitor.stopHealthMonitoring();
      const completionTime = Date.now() - startTime.current;
      productionLogger.debug('Stream completed successfully', { 
        messageId, 
        duration: completionTime, 
        finalLength: accumulatorRef.current.length,
        retryAttempt,
        healthStats: healthMonitor.getHealthStats()
      });

    } catch (error) {
      // Stop health monitoring on error
      healthMonitor.stopHealthMonitoring();
      
      // Handle specific abort errors gracefully
      if (error instanceof DOMException && error.name === 'AbortError') {
        const healthStats = healthMonitor.getHealthStats();
        const shouldRetry = retryAttempt < config.maxRetries && 
                           !healthStats.isHealthy;
                           
        if (shouldRetry) {
          productionLogger.info('Stream aborted due to health issues, attempting recovery', {
            retryAttempt,
            maxRetries: config.maxRetries,
            healthStats
          });
          
          gracefulFallback.triggerFallback('Stream health failure', error as Error);
          
          // Wait before retrying
          setTimeout(() => {
            startStreamingWithRecovery(
              messageId, 
              deliberationId, 
              onUpdate, 
              onComplete, 
              onError, 
              mode, 
              retryAttempt + 1
            );
          }, config.retryDelay * Math.pow(2, retryAttempt)); // Exponential backoff
          
          return;
        } else {
          productionLogger.debug('Request aborted intentionally or max retries reached');
          return; // Exit gracefully without calling onError
        }
      }
      
      productionLogger.error('Streaming error occurred', error);
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      
      // Check if we should retry
      const shouldRetry = retryAttempt < config.maxRetries && 
                         !errorMessage.includes('abort') &&
                         !errorMessage.includes('cancelled');
      
      if (shouldRetry) {
        productionLogger.info('Attempting stream recovery', {
          error: errorMessage,
          retryAttempt,
          maxRetries: config.maxRetries
        });
        
        setStreamingState(prev => ({
          ...prev,
          lastError: errorMessage,
          canRetry: true
        }));
        
        // Wait before retrying with exponential backoff
        setTimeout(() => {
          startStreamingWithRecovery(
            messageId, 
            deliberationId, 
            onUpdate, 
            onComplete, 
            onError, 
            mode, 
            retryAttempt + 1
          );
        }, config.retryDelay * Math.pow(2, retryAttempt));
        
        return;
      }
      
      // Record streaming error  
      productionLogger.error('Streaming error details', { 
        messageId, 
        errorMessage, 
        duration: Date.now() - startTime.current,
        retryAttempt,
        maxRetries: config.maxRetries
      });
      
      setStreamingState(prev => ({
        ...prev,
        lastError: errorMessage,
        canRetry: false
      }));
      
      onError(errorMessage);
    } finally {
      // Enhanced cleanup to prevent memory leaks and hanging UI
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Stop health monitoring
      healthMonitor.stopHealthMonitoring();
      
      // Reset streaming state if this is the final attempt
      if (retryAttempt >= config.maxRetries || 
          !streamingState.canRetry ||
          streamingState.lastError?.includes('abort')) {
        setStreamingState({
          isStreaming: false,
          currentMessage: '',
          messageId: null,
          agentType: null,
          retryCount: 0,
          lastError: null,
          canRetry: false,
        });
      }
      
      // Critical RAF cleanup to prevent memory accumulation
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      
      // Clear stream controller reference
      streamControllerRef.current = null;
      
      productionLogger.debug('Streaming cleanup completed', { 
        retryAttempt, 
        finalAttempt: retryAttempt >= config.maxRetries 
      });
    }
  }, [streamingState.agentType, streamingState.isStreaming, streamingState.messageId, streamingState.canRetry, streamingState.lastError]);

  const startStreaming = useCallback((
    messageId: string,
    deliberationId: string,
    onUpdate: (content: string, messageId: string, agentType: string | null) => void,
    onComplete: (finalContent: string, messageId: string, agentType: string | null) => void,
    onError: (error: string) => void,
    mode: 'chat' | 'learn' = 'chat'
  ) => {
    return startStreamingWithRecovery(messageId, deliberationId, onUpdate, onComplete, onError, mode, 0);
  }, [startStreamingWithRecovery]);

  const retryStreaming = useCallback((
    messageId: string,
    deliberationId: string,
    onUpdate: (content: string, messageId: string, agentType: string | null) => void,
    onComplete: (finalContent: string, messageId: string, agentType: string | null) => void,
    onError: (error: string) => void,
    mode: 'chat' | 'learn' = 'chat'
  ) => {
    productionLogger.info('Manual stream retry requested', { messageId });
    // Reset accumulator for fresh retry
    accumulatorRef.current = '';
    return startStreamingWithRecovery(messageId, deliberationId, onUpdate, onComplete, onError, mode, 0);
  }, [startStreamingWithRecovery]);

  const stopStreaming = useCallback(() => {
    productionLogger.debug('Stopping stream');
    
    // Stop health monitoring
    healthMonitor.stopHealthMonitoring();
    
    if (streamControllerRef.current) {
      try {
        streamControllerRef.current.abort();
      } catch (error) {
        productionLogger.warn('Error aborting stream', error);
      }
      streamControllerRef.current = null;
    }
    
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    
    setStreamingState({
      isStreaming: false,
      currentMessage: '',
      messageId: null,
      agentType: null,
      retryCount: 0,
      lastError: null,
      canRetry: false,
    });
    
    accumulatorRef.current = '';
  }, [healthMonitor]);

  const isStreamingMessage = useCallback((messageId: string) => {
    return streamingState.isStreaming && streamingState.messageId === messageId;
  }, [streamingState.isStreaming, streamingState.messageId]);

  const getStreamHealth = useCallback(() => {
    return {
      ...healthMonitor.getHealthStats(),
      currentRetryCount: streamingState.retryCount,
      canRetry: streamingState.canRetry,
      lastError: streamingState.lastError,
    };
  }, [healthMonitor, streamingState.retryCount, streamingState.canRetry, streamingState.lastError]);

  return {
    streamingState,
    startStreaming,
    retryStreaming,
    stopStreaming,
    isStreamingMessage,
    getStreamHealth,
  };
};