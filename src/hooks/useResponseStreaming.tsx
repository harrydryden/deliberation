import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

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

  const startStreaming = useCallback(async (
    messageId: string,
    deliberationId: string,
    onUpdate: (content: string, messageId: string, agentType: string | null) => void,
    onComplete: (finalContent: string, messageId: string, agentType: string | null) => void,
    onError: (error: string) => void
  ) => {
    console.log('🌊 Starting streaming for message:', messageId);
    
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

    // Cancel any existing stream
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
    }

    streamControllerRef.current = new AbortController();
    
    // Add timeout for streaming operations to prevent hanging
    const timeoutId = setTimeout(() => {
      console.log('⏰ Streaming timeout reached, aborting...');
      if (streamControllerRef.current) {
        streamControllerRef.current.abort();
      }
      onError('Streaming request timed out');
    }, 60000); // 60 second timeout

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
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messageId,
          deliberationId,
          mode: 'chat'
        }),
        signal: streamControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`Edge function failed with status ${response.status}: ${response.statusText}`);
      }

      console.log('📡 Streaming response received successfully');

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
        const { done, value } = await reader.read();
        
        if (streamControllerRef.current?.signal.aborted) {
          console.log('🛑 Stream aborted by user');
          break;
        }

        if (done) {
          console.log('✅ Stream completed');
          break;
        }

        try {
          const chunk = decoder.decode(value, { stream: true });
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
      }

      // Final update
      updateUI();
      onComplete(accumulatorRef.current, messageId, streamingState.agentType);

    } catch (error) {
      console.error('❌ Streaming error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      
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
      // Clear timeout to prevent memory leaks
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      setStreamingState({
        isStreaming: false,
        currentMessage: '',
        messageId: null,
        agentType: null,
      });
      
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      
      streamControllerRef.current = null;
      accumulatorRef.current = '';
    }
  }, [streamingState.agentType, streamingState.isStreaming, streamingState.messageId]);

  const stopStreaming = useCallback(() => {
    console.log('🛑 Stopping stream...');
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
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