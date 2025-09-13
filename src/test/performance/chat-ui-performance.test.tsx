/**
 * Chat UI Performance Validation Tests
 * Validates the performance improvements made to chat components
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { performanceMonitor } from '@/utils/performanceMonitor';
import { OptimizedMessageList } from '@/components/chat/OptimizedMessageList';
import { MessageQueueStatus } from '@/components/chat/MessageQueueStatus';
import { EnhancedMessageInput } from '@/components/chat/EnhancedMessageInput';
import { BalanceIndicator } from '@/components/chat/BalanceIndicator';
import { ChatModeSelector } from '@/components/chat/ChatModeSelector';
import { ViewModeSelector } from '@/components/chat/ViewModeSelector';
import type { ChatMessage } from '@/types/index';
import type { QueuedMessage } from '@/hooks/useMessageQueue';

// Mock heavy dependencies
vi.mock('@/hooks/useOptimizedState', () => ({
  useSimplifiedPerformance: () => ({
    createOptimizedCallback: (fn: any, deps: any) => fn
  })
}));

vi.mock('@/hooks/useUIStateDebugger', () => ({
  useUIStateDebugger: () => ({})
}));

const createMockMessages = (count: number): ChatMessage[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    content: `Test message content ${i}`,
    message_type: i % 2 === 0 ? 'user' : 'bill_agent',
    created_at: new Date(Date.now() - i * 1000).toISOString(),
    status: 'sent' as const,
    user_id: 'test-user',
    deliberation_id: 'test-delib'
  }));
};

const createMockQueuedMessages = (count: number): QueuedMessage[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `queue-${i}`,
    content: `Queued message ${i}`,
    status: i % 3 === 0 ? ('failed' as const) : ('queued' as const),
    queuePosition: i,
    parentMessageId: undefined,
    timestamp: new Date(Date.now() - i * 1000),
    retries: i % 3 === 0 ? 1 : 0,
    error: i % 3 === 0 ? 'Network error' : undefined,
    mode: 'chat' as const
  }));
};

describe('Chat UI Performance Tests', () => {
  beforeEach(() => {
    performanceMonitor.reset();
    vi.clearAllMocks();
  });

  describe('OptimizedMessageList Performance', () => {
    it('should render large message lists efficiently', () => {
      const startTime = performance.now();
      const messages = createMockMessages(100);
      
      render(
        <OptimizedMessageList
          messages={messages}
          isTyping={false}
          deliberationId="test-delib"
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should render 100 messages in under 200ms
      expect(renderTime).toBeLessThan(200);
      expect(screen.getByTestId('virtualized-list')).toBeInTheDocument();
    });

    it('should handle rapid message updates without excessive re-renders', async () => {
      const messages = createMockMessages(10);
      const { rerender } = render(
        <OptimizedMessageList
          messages={messages}
          isTyping={false}
          deliberationId="test-delib"
        />
      );

      // Simulate rapid updates
      const iterations = 20;
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const newMessages = [...messages, createMockMessages(1)[0]];
        rerender(
          <OptimizedMessageList
            messages={newMessages}
            isTyping={false}
            deliberationId="test-delib"
          />
        );
      }
      
      const endTime = performance.now();
      const avgTimePerUpdate = (endTime - startTime) / iterations;
      
      // Each update should take less than 16ms (60fps budget)
      expect(avgTimePerUpdate).toBeLessThan(16);
    });
  });

  describe('MessageQueueStatus Performance', () => {
    it('should efficiently compute queue statistics', () => {
      const queuedMessages = createMockQueuedMessages(50);
      const startTime = performance.now();
      
      const { rerender } = render(
        <MessageQueueStatus
          queuedMessages={queuedMessages}
          processingCount={2}
          onRetryMessage={() => {}}
          onRemoveMessage={() => {}}
        />
      );

      for (let i = 0; i < 10; i++) {
        rerender(
          <MessageQueueStatus
            queuedMessages={queuedMessages}
            processingCount={2}
            onRetryMessage={() => {}}
            onRemoveMessage={() => {}}
          />
        );
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Multiple re-renders with same data should be fast due to memoization
      expect(totalTime).toBeLessThan(50);
    });

    it('should only re-render when queue stats actually change', () => {
      const messages = createMockQueuedMessages(10);
      let renderCount = 0;
      
      const MockComponent = (props: any) => {
        renderCount++;
        return <MessageQueueStatus {...props} />;
      };
      
      const { rerender } = render(
        <MockComponent
          queuedMessages={messages}
          processingCount={1}
          onRetryMessage={() => {}}
          onRemoveMessage={() => {}}
        />
      );
      
      // Same props should not trigger re-render
      rerender(
        <MockComponent
          queuedMessages={messages}
          processingCount={1}
          onRetryMessage={() => {}}
          onRemoveMessage={() => {}}
        />
      );
      
      // Should have rendered only once due to React.memo
      expect(renderCount).toBe(1);
      
      // Different processing count should trigger re-render
      rerender(
        <MockComponent
          queuedMessages={messages}
          processingCount={2}
          onRetryMessage={() => {}}
          onRemoveMessage={() => {}}
        />
      );
      
      expect(renderCount).toBe(2);
    });
  });

  describe('EnhancedMessageInput Performance', () => {
    it('should throttle input type detection during rapid typing', async () => {
      const mockSendMessage = vi.fn();
      render(
        <EnhancedMessageInput
          onSendMessage={mockSendMessage}
          disabled={false}
        />
      );
      
      const textarea = screen.getByRole('textbox');
      const startTime = performance.now();
      
      // Simulate rapid typing
      const rapidInputs = [
        'What', 'What is', 'What is the', 'What is the answer', 'What is the answer?'
      ];
      
      for (const input of rapidInputs) {
        fireEvent.change(textarea, { target: { value: input } });
      }
      
      const endTime = performance.now();
      const inputTime = endTime - startTime;
      
      // Rapid input handling should be smooth
      expect(inputTime).toBeLessThan(100);
    });

    it('should memoize expensive UI calculations', () => {
      const { rerender } = render(
        <EnhancedMessageInput
          onSendMessage={() => {}}
          disabled={false}
        />
      );

      const startTime = performance.now();
      
      // Multiple re-renders should be fast due to memoization
      for (let i = 0; i < 20; i++) {
        rerender(
          <EnhancedMessageInput
            onSendMessage={() => {}}
            disabled={false}
          />
        );
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // 20 re-renders should complete quickly
      expect(totalTime).toBeLessThan(100);
    });
  });

  describe('BalanceIndicator Performance', () => {
    it('should efficiently calculate balance statistics', () => {
      const startTime = performance.now();
      
      render(
        <BalanceIndicator
          supportive={150}
          counter={75}
          neutral={25}
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should render balance calculations quickly
      expect(renderTime).toBeLessThan(20);
    });

    it('should memoize calculations to prevent unnecessary work', () => {
      const { rerender } = render(
        <BalanceIndicator
          supportive={100}
          counter={50}
          neutral={25}
        />
      );

      const startTime = performance.now();
      
      // Same props should not trigger expensive recalculations
      for (let i = 0; i < 15; i++) {
        rerender(
          <BalanceIndicator
            supportive={100}
            counter={50}
            neutral={25}
          />
        );
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Multiple re-renders with same data should be very fast
      expect(totalTime).toBeLessThan(50);
    });
  });

  describe('Mode Selectors Performance', () => {
    it('should render ChatModeSelector efficiently', () => {
      const startTime = performance.now();
      
      render(
        <ChatModeSelector
          mode="chat"
          onModeChange={() => {}}
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      expect(renderTime).toBeLessThan(10);
    });

    it('should render ViewModeSelector efficiently', () => {
      const startTime = performance.now();
      
      render(
        <ViewModeSelector
          mode="chat"
          onModeChange={() => {}}
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      expect(renderTime).toBeLessThan(10);
    });
  });

  describe('Overall Performance Validation', () => {
    it('should meet render budget targets across all components', () => {
      const components = [
        () => <OptimizedMessageList messages={createMockMessages(50)} isTyping={false} deliberationId="test" />,
        () => <MessageQueueStatus queuedMessages={createMockQueuedMessages(20)} processingCount={1} onRetryMessage={() => {}} onRemoveMessage={() => {}} />,
        () => <EnhancedMessageInput onSendMessage={() => {}} disabled={false} />,
        () => <BalanceIndicator supportive={100} counter={50} neutral={25} />,
        () => <ChatModeSelector mode="chat" onModeChange={() => {}} />,
        () => <ViewModeSelector mode="chat" onModeChange={() => {}} />
      ];
      
      const renderTimes: number[] = [];
      
      components.forEach(Component => {
        const startTime = performance.now();
        render(<Component />);
        const endTime = performance.now();
        renderTimes.push(endTime - startTime);
      });
      
      // All components should render within budget
      const maxRenderTime = Math.max(...renderTimes);
      const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
      
      expect(maxRenderTime).toBeLessThan(50); // No single component should take more than 50ms
      expect(avgRenderTime).toBeLessThan(20); // Average should be under 20ms
    });

    it('should track performance metrics correctly', async () => {
      // Reset performance monitor
      performanceMonitor.reset();
      
      // Render components that should be tracked
      render(<OptimizedMessageList messages={[]} isTyping={false} deliberationId="test" />);
      render(<MessageQueueStatus queuedMessages={[]} processingCount={0} onRetryMessage={() => {}} onRemoveMessage={() => {}} />);
      render(<EnhancedMessageInput onSendMessage={() => {}} disabled={false} />);
      
      // Allow effects to run
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that components were tracked
      const allMetrics = performanceMonitor.getMetrics();
      expect(Object.keys(allMetrics)).toContain('OptimizedMessageList');
      expect(Object.keys(allMetrics)).toContain('MessageQueueStatus');
      expect(Object.keys(allMetrics)).toContain('EnhancedMessageInput');
    });
  });
});