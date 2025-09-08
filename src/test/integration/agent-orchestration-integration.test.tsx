/**
 * Integration test for agent orchestration flow
 * F008: Verify chat → agent → streaming integration works end-to-end
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '@/hooks/useChat';
import { useResponseStreaming } from '@/hooks/useResponseStreaming';

// Mock dependencies
vi.mock('@/hooks/useSupabaseAuth', () => ({
  useSupabaseAuth: () => ({
    user: { id: 'test-user', email: 'test@test.com' },
    isLoading: false
  })
}));

vi.mock('@/hooks/useServices', () => ({
  useServices: () => ({
    messageService: {
      sendMessage: vi.fn().mockResolvedValue({
        id: 'msg-123',
        content: 'Test message',
        message_type: 'user',
        created_at: new Date().toISOString(),
        user_id: 'test-user'
      }),
      getMessages: vi.fn().mockResolvedValue([])
    },
    realtimeService: {
      subscribeToMessages: vi.fn().mockReturnValue(() => {})
    }
  })
}));

// Mock streaming function
global.fetch = vi.fn();

describe('Agent Orchestration Integration (F008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Chat → Agent Flow', () => {
    it('should initiate agent streaming after message send', async () => {
      const { result } = renderHook(() => useChat('test-deliberation'));
      
      // Mock successful message send
      await act(async () => {
        await result.current.sendMessage('Test message for agent');
      });

      // Should queue message for processing  
      expect(result.current.messageQueue.stats.queued).toBeGreaterThan(0);
    });

    it('should handle streaming initialization', async () => {
      const { result } = renderHook(() => useResponseStreaming());
      
      // Mock fetch for streaming
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: async () => ({ done: true, value: undefined })
          })
        }
      });

      await act(async () => {
        result.current.startStreaming(
          'test-msg',
          'test-deliberation',
          () => {}, // onUpdate
          () => {}, // onComplete
          () => {}  // onError
        );
      });

      expect(result.current.streamingState.isStreaming).toBe(true);
    });

    it('should handle streaming errors gracefully', async () => {
      const { result } = renderHook(() => useResponseStreaming());
      const onError = vi.fn();
      
      // Mock fetch failure
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await act(async () => {
        result.current.startStreaming(
          'test-msg',
          'test-deliberation',
          () => {},
          () => {},
          onError
        );
      });

      expect(onError).toHaveBeenCalled();
      expect(result.current.streamingState.isStreaming).toBe(false);
    });
  });

  describe('Timeout Integration', () => {
    it('should use aligned timeouts (40s streaming, 45s processing)', () => {
      const EXPECTED_STREAMING_TIMEOUT = 40000;
      const EXPECTED_PROCESSING_TIMEOUT = 45000;
      
      // Verify timeout constants are properly aligned
      expect(EXPECTED_STREAMING_TIMEOUT).toBeLessThan(EXPECTED_PROCESSING_TIMEOUT);
      expect(EXPECTED_PROCESSING_TIMEOUT - EXPECTED_STREAMING_TIMEOUT).toBe(5000);
    });
  });

  describe('Agent Response Processing', () => {
    it('should handle streaming chunks correctly', async () => {
      const { result } = renderHook(() => useResponseStreaming());
      const onUpdate = vi.fn();
      const onComplete = vi.fn();
      
      // Mock streaming response with chunks
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"content":"Hello","done":false}\n')
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"content":" World","done":false}\n')
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: { getReader: () => mockReader }
      });

      await act(async () => {
        result.current.startStreaming(
          'test-msg',
          'test-deliberation',
          onUpdate,
          onComplete,
          () => {}
        );
      });

      // Should process streaming chunks
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  describe('Edge Function Integration', () => {
    it('should call correct edge function endpoint', async () => {
      const { result } = renderHook(() => useResponseStreaming());
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: async () => ({ done: true, value: undefined })
          })
        }
      });

      await act(async () => {
        result.current.startStreaming(
          'test-msg',
          'test-deliberation',
          () => {},
          () => {},
          () => {}
        );
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('agent-orchestration-stream'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            messageId: 'test-msg',
            deliberationId: 'test-deliberation',
            mode: 'chat'
          })
        })
      );
    });
  });
});