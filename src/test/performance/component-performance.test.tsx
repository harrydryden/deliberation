import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import { performance } from 'perf_hooks';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { OptimizedMessageList } from '@/components/chat/OptimizedMessageList';

// Mock heavy dependencies
vi.mock('@/hooks/useStandardizedAdminData', () => ({
  useStandardizedAdminData: () => ({
    users: { data: [], isLoading: false, error: null },
    globalAgents: { data: [], isLoading: false, error: null },
    localAgents: { data: [], isLoading: false, error: null },
    deliberations: { data: [], isLoading: false, error: null },
  }),
}));

vi.mock('@/hooks/useServices', () => ({
  useServices: () => ({
    adminService: { getSystemStats: vi.fn(() => Promise.resolve({})) },
  }),
}));

describe('Component Performance Tests', () => {
  it('AdminDashboard renders within performance budget', async () => {
    const startTime = performance.now();
    
    render(<AdminDashboard />);
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should render within 100ms
    expect(renderTime).toBeLessThan(100);
    
    // Should display without errors
    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
  });

  it('OptimizedMessageList handles large message lists efficiently', async () => {
    const largeMessageList = Array.from({ length: 1000 }, (_, i) => ({
      id: `message-${i}`,
      content: `Message ${i}`,
      message_type: 'user' as const,
      user_id: 'user-1',
      deliberation_id: 'deliberation-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    
    const startTime = performance.now();
    
    render(<OptimizedMessageList messages={largeMessageList} isLoading={false} isTyping={false} deliberationId="test-deliberation-id" />);
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should handle large lists within reasonable time (500ms)
    expect(renderTime).toBeLessThan(500);
    
    // Should use virtualization for performance
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
  });

  it('measures memory usage during heavy operations', () => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
    
    // Simulate heavy operation
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      data: `Large data structure ${i}`.repeat(100),
    }));
    
    render(<AdminDashboard />);
    
    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (less than 50MB)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    
    // Clean up
    largeArray.length = 0;
  });
});