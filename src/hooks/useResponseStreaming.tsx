import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { useStreamingPerformanceMonitor } from './useStreamingPerformanceMonitor';
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
  
  // Performance monitoring hooks
  const perfMonitor = useStreamingPerformanceMonitor();
  const uiDebugger = useUIStateDebugger('ResponseStreaming');
  const networkTracker = useNetworkPerformanceTracker();

  // Enhanced timeout detection in streaming state management
  const startStreaming = useCallback(async (
    messageId: string,
    deliberationId: string,
    onUpdate: (content: string, messageId: string, agentType: string | null) => void,
    onComplete: (finalContent: string, messageId: string, agentType: string | null) => void,
    onError: (error: string) => void
  ) => {
    console.log('🌊 Starting streaming for message:', messageId);
    
    // Start performance monitoring
    perfMonitor.startTracking(messageId);
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
        console.warn('⚠️ Error aborting previous stream:', error);
      }
    }

    streamControllerRef.current = new AbortController();
    
    // F004 Fix: Align timeout with edge function - use 40s to give edge function time to respond
    const STREAMING_TIMEOUT = 40000; // 40 seconds to align with 45s edge function timeout
    const HEARTBEAT_INTERVAL = 5000; // 5 second heartbeat checks
    
    let lastActivity = Date.now();
    let heartbeatCount = 0;
    
    const timeoutId = setTimeout(() => {
      console.log('⏰ Main streaming timeout reached (40s), aborting...');
      if (streamControllerRef.current) {
        try {
          streamControllerRef.current.abort();
        } catch (error) {
          console.warn('⚠️ Error aborting on timeout:', error);
        }
      }
      // F003 Fix: Clear streaming state on timeout
      setStreamingState({
        isStreaming: false,
        currentMessage: '',
        messageId: null,
        agentType: null,
      });
      // F004 Fix: Call onError to notify queue that processing failed
      onError('Streaming timeout after 40 seconds. Please try again.');
    }, STREAMING_TIMEOUT);
    
    // Heartbeat monitoring to detect stalled connections
    const heartbeatId = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity;
      heartbeatCount++;
      
      if (timeSinceActivity > 15000) { // 15 seconds without activity
        console.log(`💓 Heartbeat ${heartbeatCount}: No activity for ${timeSinceActivity}ms, checking connection...`);
        
        if (timeSinceActivity > 35000) { // F004 Fix: 35 seconds to align with new timeout
          console.warn('💔 Connection appears stalled, preparing for timeout...');
          // Pre-emptively clear state to prevent hanging UI
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false
          }));
          // Call onError to notify queue
          onError('Connection stalled - no activity for 35 seconds.');
        }
      } else {
        console.log(`💓 Heartbeat ${heartbeatCount}: Active (${timeSinceActivity}ms since last activity)`);
      }
    }, HEARTBEAT_INTERVAL);

    try {
      console.log('🔍 Checking if streaming is already in progress...');
      
      // Check if this message is already streaming
      const isAlreadyStreaming = streamingState.isStreaming && streamingState.messageId === messageId;
      if (isAlreadyStreaming) {
        console.log('⚠️ Message already streaming, skipping...');
        setStreamingState({
          isStreaming: false,
          currentMessage: '',
          messageId: null,
          agentType: null,
        });
        return;
      }

      console.log('🌊 Proceeding to streaming function call...');

      // Consistent session-based auth for streaming API calls
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      console.log('🔄 Using optimized streaming function call...');
      
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
        console.log('🔑 Added authorization header to request');
      } else {
        console.warn('⚠️ No access token available for request');
      }
      
      console.log('🌐 Making request to:', functionUrl);
      console.log('📦 Request payload:', { messageId, deliberationId, mode: 'chat' });
      
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
      
      console.log('📊 Response status:', response.status, response.statusText);
      console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        // Log response body for debugging
        let errorBody = '';
        try {
          errorBody = await response.text();
          console.error('❌ Error response body:', errorBody);
        } catch (e) {
          console.error('❌ Could not read error response body:', e);
        }
        throw new Error(`Edge function failed with status ${response.status}: ${response.statusText}. Body: ${errorBody}`);
      }

      console.log('📡 Streaming response received successfully');
      
      // Record first response received
      networkTracker.endTracking(networkId, response.status);
      perfMonitor.recordFirstChunk();

      if (!response.body) {
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      console.log('📖 Starting to read stream...');

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
            console.log('🛑 Stream aborted by user');
            await reader.cancel();
            break;
          }

          if (done) {
            console.log('✅ Stream completed');
            break;
          }

          try {
            const chunk = decoder.decode(value, { stream: true });
            lastActivity = Date.now(); // Update activity timestamp
            console.log('📦 Received chunk:', chunk.substring(0, 100) + '...');

            // Parse each line as a potential JSON object
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6);
                if (jsonStr === '[DONE]') {
                  console.log('🏁 Received [DONE] signal');
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
                    console.log('✅ Received done signal from parsed data');
                    break;
                  }
                } catch (parseError) {
                  console.warn('⚠️ Failed to parse streaming chunk:', parseError);
                  // Continue processing other lines
                }
              }
            }
          } catch (chunkError) {
            console.error('❌ Error processing chunk:', chunkError);
            // Continue processing stream
          }
        } catch (readError) {
          // Handle specific abort errors gracefully
          if (readError instanceof DOMException && readError.name === 'AbortError') {
            console.log('🛑 Stream reading aborted intentionally');
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
      perfMonitor.recordStreamComplete(true, accumulatorRef.current.length);
      uiDebugger.trackStreamingEnd('stream-complete-success');

    } catch (error) {
      // Handle specific abort errors gracefully
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('🛑 Request aborted intentionally');
        return; // Exit gracefully without calling onError
      }
      
      console.error('❌ Streaming error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      
      // Record error for performance monitoring
      perfMonitor.recordError(errorMessage);
      uiDebugger.trackError(errorMessage);
      
      // F005 Fix: Enhanced structured logging for better observability
      logger.error('Streaming failed', error as Error, { 
        messageId, 
        deliberationId,
        streamingState: {
          isStreaming: streamingState.isStreaming,
          currentMessageLength: accumulatorRef.current.length,
          agentType: streamingState.agentType,
          messageId: streamingState.messageId
        },
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        requestInfo: {
          userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Unknown',
          url: typeof window !== 'undefined' ? window.location.href : 'Unknown'
        },
        performanceMetrics: {
          streamDuration: Date.now() - performance.now(),
          accumulatedBytes: accumulatorRef.current.length,
          rafCallsScheduled: rafIdRef.current ? 1 : 0
        }
      });
      
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
      
      console.log('🧹 Streaming cleanup completed with memory leak prevention');
    }
  }, [streamingState.agentType, streamingState.isStreaming, streamingState.messageId]);

  const stopStreaming = useCallback(() => {
    console.log('🛑 Stopping stream...');
    if (streamControllerRef.current) {
      try {
        streamControllerRef.current.abort();
      } catch (error) {
        console.warn('⚠️ Error aborting stream:', error);
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