import { useState, useCallback, useRef } from 'react';
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
  const rafPendingRef = useRef<boolean>(false);
  const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

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
      // Prefer backend proxy if available, else fallback to Supabase
      const apiBase = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
      const endpoint = apiBase 
        ? `${apiBase}/api/v1/stream/agent`
        : `${(SUPABASE_URL || '')}/functions/v1/agent-orchestration-stream`;
      const authHeader = apiBase ? undefined : (SUPABASE_ANON_KEY ? `Bearer ${SUPABASE_ANON_KEY}` : undefined);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
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
            }

            if (parsed.content) {
              currentContent += parsed.content;
              if (!rafPendingRef.current) {
                rafPendingRef.current = true;
                requestAnimationFrame(() => {
                  setStreamingState(prev => ({ 
                    ...prev, 
                    currentMessage: currentContent,
                    agentType: currentAgentType 
                  }));
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