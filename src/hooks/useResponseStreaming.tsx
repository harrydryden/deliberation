import { useState, useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';

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
  const rafPendingRef = useRef<boolean>(false);

  const startStreaming = useCallback(async (
    messageId: string,
    deliberationId: string,
    onUpdate: (content: string, agentType: string) => void,
    onComplete: (finalContent: string, agentType: string) => void,
    onError: (error: string) => void
  ) => {
    // Cancel any existing stream
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
    }

    streamControllerRef.current = new AbortController();

    setStreamingState({
      isStreaming: true,
      currentMessage: '',
      messageId,
      agentType: null,
    });

    try {
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No authentication session found');
      }

      // Use Supabase functions.invoke for proper authentication
      const { data, error } = await supabase.functions.invoke('agent-orchestration-stream', {
        body: {
          messageId,
          deliberationId,
          mode: 'chat'
        }
      });

      if (error) {
        throw new Error(`Supabase function error: ${error.message}`);
      }

      // If the function returns data directly (non-streaming), handle it
      if (data && !data.stream) {
        onComplete(data.content || '', data.agentType || 'flow_agent');
        setStreamingState({
          isStreaming: false,
          currentMessage: '',
          messageId: null,
          agentType: null,
        });
        return;
      }

      // For streaming responses, we need to make a direct fetch call with proper auth
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const response = await fetch(`https://iowsxuxkgvpgrvvklwyt.supabase.co/functions/v1/agent-orchestration-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM',
        },
        body: JSON.stringify({
          messageId,
          deliberationId,
          mode: 'chat'
        }),
        signal: streamControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentContent = '';
      let currentAgentType = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        // Decode the chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            // Expect server-sent events format: data: {...}
            const dataLine = line.startsWith('data: ') ? line.slice(6) : line;
            const parsed: StreamingResponse = JSON.parse(dataLine);

            if (parsed.error) {
              console.error('❌ Streaming error received:', parsed.error);
              onError(parsed.error);
              return;
            }

            if (parsed.agentType && !currentAgentType) {
              currentAgentType = parsed.agentType;
              setStreamingState(prev => ({ ...prev, agentType: currentAgentType }));
              // Only notify UI of agent type if we have a valid one
              if (currentAgentType) {
                onUpdate('', currentAgentType);
              }
            }

            if (parsed.content) {
              currentContent += parsed.content;
              if (!rafPendingRef.current && currentAgentType) {
                rafPendingRef.current = true;
                requestAnimationFrame(() => {
                  setStreamingState(prev => ({ 
                    ...prev, 
                    currentMessage: currentContent,
                    agentType: currentAgentType 
                  }));
                  // Only update UI if we have both content and agent type
                  onUpdate(currentContent, currentAgentType);
                  rafPendingRef.current = false;
                });
              }
            }

            if (parsed.done) {
              onComplete(currentContent, currentAgentType);
              setStreamingState({
                isStreaming: false,
                currentMessage: '',
                messageId: null,
                agentType: null,
              });
              console.log('✅ Streaming completed successfully');
              return;
            }
          } catch (parseError) {
            logger.error('Error parsing streaming response', { error: parseError, line });
          }
        }
      }

      // If we get here, stream ended without done signal
      if (currentContent) {
        onComplete(currentContent, currentAgentType);
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.info('Streaming aborted by user');
      } else {
        logger.error('Streaming error', { error });
        onError(error.message || 'Streaming failed');
      }
    } finally {
      setStreamingState({
        isStreaming: false,
        currentMessage: '',
        messageId: null,
        agentType: null,
      });
      streamControllerRef.current = null;
      rafPendingRef.current = false;
    }
  }, []);

  const stopStreaming = useCallback(() => {
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
      streamControllerRef.current = null;
    }
    
    setStreamingState({
      isStreaming: false,
      currentMessage: '',
      messageId: null,
      agentType: null,
    });
  }, []);

  const isStreamingMessage = useCallback((messageId: string) => {
    return streamingState.isStreaming && streamingState.messageId === messageId;
  }, [streamingState]);

  return {
    streamingState,
    startStreaming,
    stopStreaming,
    isStreamingMessage,
  };
};