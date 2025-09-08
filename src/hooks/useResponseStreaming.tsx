import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { productionLogger } from '@/utils/productionLogger';
// Streaming performance monitoring consolidated into production logger
import { useUIStateDebugger } from './useUIStateDebugger';
import { useNetworkPerformanceTracker } from './useNetworkPerformanceTracker';

interface StreamingState {
  isStreaming: boolean;
  currentMessage: string;
  messageId: string | null;
  agentType: string | null;
}

interface StreamingResponse {
  content: string;
  done: boolean;
  messageId?: string;
  agentType?: string;
  error?: string;
}

export const useResponseStreaming = () => {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    currentMessage: '',
    messageId: null,
    agentType: null,
  });

  const streamControllerRef = useRef<AbortController | null>(null);
  const accumulatorRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  
  // Performance monitoring replaced with production logging
  const startTime = useRef<number>(0);
  const uiDebugger = useUIStateDebugger('ResponseStreaming');
  const networkTracker = useNetworkPerformanceTracker();

  // Critical cleanup on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      productionLogger.debug('ResponseStreaming component unmounting - cleaning up');
      
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
  }, []);

  // Enhanced timeout detection in streaming state management
  const startStreaming = useCallback(async (
    messageId: string,
    deliberationId: string,
    onUpdate: (content: string, messageId: string, agentType: string | null) => void,
    onComplete: (finalContent: string, messageId: string, agentType: string | null) => void,
    onError: (error: string) => void
  ) => {
    productionLogger.debug('Starting streaming for message', { messageId });
    
    // Start performance tracking
    startTime.current = Date.now();
    uiDebugger.trackStreamingStart('user-message-sent');
    
    // Cleanup any previous RAF callbacks to prevent memory leaks
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    
    // Reset previous state
    accumulatorRef.current = '';
    setStreamingState({
      isStreaming: true,
      currentMessage: '',
      messageId,
      agentType: null,
    });
    
    uiDebugger.trackTransition('streaming-ui-active', 'stream-state-set');

    // Cancel any existing stream
    if (streamControllerRef.current) {
      try {
        streamControllerRef.current.abort();
      } catch (error) {
        productionLogger.warn('Error aborting previous stream', error);
      }
    }

    streamControllerRef.current = new AbortController();
    
    // ALIGNED TIMEOUTS: Match with queue processing timeout for consistency
    const STREAMING_TIMEOUT = 75000; // 75 seconds to align with queue timeout
    const HEARTBEAT_INTERVAL = 5000; // 5 second heartbeat checks
    
    let lastActivity = Date.now();
    let heartbeatCount = 0;
    
    const timeoutId = setTimeout(() => {
      productionLogger.warn('Main streaming timeout reached (60s), aborting');
      if (streamControllerRef.current) {
        try {
          streamControllerRef.current.abort();
        } catch (error) {
          productionLogger.warn('Error aborting on timeout', error);
        }
      }
      // ALIGNED FIX: Clear streaming state on timeout
      setStreamingState({
        isStreaming: false,
        currentMessage: '',
        messageId: null,
        agentType: null,
      });
      // ALIGNED TIMEOUT: Updated message to match new timeout
      onError('Streaming timeout after 75 seconds. Please try again.');
    }, STREAMING_TIMEOUT);
    
    // Heartbeat monitoring to detect stalled connections
    const heartbeatId = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity;
      heartbeatCount++;
      
      // Only check for stalls if we've received at least one chunk
      // This prevents premature timeout during initial processing
      const hasReceivedData = accumulatorRef.current.length > 0;
      
      if (timeSinceActivity > 15000) { // 15 seconds without activity
        productionLogger.debug('Heartbeat: No activity detected', { 
          heartbeatCount, 
          timeSinceActivity, 
          hasReceivedData,
          accumulatedLength: accumulatorRef.current.length 
        });
        
        // Only trigger stall detection if we've already received data and then stopped
        // This prevents false positives during initial AI processing time
        if (hasReceivedData && timeSinceActivity > 25000) { // Increased to 25 seconds after first data
          productionLogger.warn('Connection appears stalled after receiving data, preparing for timeout'); 
          // Pre-emptively clear state to prevent hanging UI
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false
          }));
          // Call onError to notify queue
          onError('Connection stalled - no activity for 25 seconds after receiving data.');
        }
      } else {
        productionLogger.debug('Heartbeat: Connection active', { heartbeatCount, timeSinceActivity });
      }
    }, HEARTBEAT_INTERVAL);

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
          mode: 'chat'
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
            lastActivity = Date.now(); // Update activity timestamp
            productionLogger.debug('Received chunk', { chunkLength: chunk.length });

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
                    lastActivity = Date.now(); // Update activity timestamp
                    
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
      
      // Record successful completion
      const completionTime = Date.now() - startTime.current;
      productionLogger.debug('Stream completed successfully', { 
        messageId, 
        duration: completionTime, 
        finalLength: accumulatorRef.current.length 
      });
      uiDebugger.trackStreamingEnd('stream-complete-success');

    } catch (error) {
      // Handle specific abort errors gracefully
      if (error instanceof DOMException && error.name === 'AbortError') {
        productionLogger.debug('Request aborted intentionally');
        return; // Exit gracefully without calling onError
      }
      
      productionLogger.error('Streaming error occurred', error);
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      
      // Record streaming error  
      productionLogger.error('Streaming error details', { 
        messageId, 
        errorMessage, 
        duration: Date.now() - startTime.current 
      });
      uiDebugger.trackError(errorMessage);
      
      // F005 Fix: Enhanced structured logging for better observability
      productionLogger.error('Streaming failed', error as Error);
      
      onError(errorMessage);
    } finally {
      // F003 Fix: Enhanced cleanup to prevent memory leaks and hanging UI
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (heartbeatId) {
        clearInterval(heartbeatId);
      }
      
      // F003 Fix: Always reset streaming state in finally block to prevent memory leaks
      setStreamingState({
        isStreaming: false,
        currentMessage: '',
        messageId: null,
        agentType: null,
      });
      
      // F003 Fix: Critical RAF cleanup to prevent memory accumulation
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      
      // F003 Fix: Ensure all references are cleared
      streamControllerRef.current = null;
      accumulatorRef.current = '';
      
      productionLogger.debug('Streaming cleanup completed with memory leak prevention');
    }
  }, [streamingState.agentType, streamingState.isStreaming, streamingState.messageId]);

  const stopStreaming = useCallback(() => {
    productionLogger.debug('Stopping stream');
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
    });
    
    accumulatorRef.current = '';
  }, []);

  const isStreamingMessage = useCallback((messageId: string) => {
    return streamingState.isStreaming && streamingState.messageId === messageId;
  }, [streamingState.isStreaming, streamingState.messageId]);

  return {
    streamingState,
    startStreaming,
    stopStreaming,
    isStreamingMessage,
  };
};