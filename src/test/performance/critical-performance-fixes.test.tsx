import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { performance } from 'perf_hooks';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';

// Mock authentication to avoid auth flow in tests
vi.mock('@/hooks/useSupabaseAuth', () => ({
  useSupabaseAuth: () => ({
    user: { id: 'test-user' },
    isLoading: false,
    isAdmin: false,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Critical Performance Issues', () => {
  beforeEach(() => {
    // Clear any performance marks
    if (typeof performance !== 'undefined' && performance.clearMarks) {
      performance.clearMarks();
    }
  });

  it('should not have negative page load metrics', async () => {
    const startTime = performance.now();
    
    render(<App />);
    
    const endTime = performance.now();
    const loadTime = endTime - startTime;
    
    // Should never have negative load times
    expect(loadTime).toBeGreaterThan(0);
    expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
  });

  it('should handle memory efficiently during component mounting', async () => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
    
    const { unmount } = render(<App />);
    
    // Wait for components to mount
    await waitFor(() => {
      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    }, { timeout: 1000 });
    
    const afterMountMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = afterMountMemory - initialMemory;
    
    // Memory increase should be reasonable (less than 10MB for initial mount)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    
    unmount();
    
    // Force garbage collection if available
    if ((global as any).gc) {
      (global as any).gc();
    }
    
    // Memory should not continuously grow
    const afterUnmountMemory = (performance as any).memory?.usedJSHeapSize || 0;
    expect(afterUnmountMemory).toBeLessThanOrEqual(afterMountMemory + (1024 * 1024)); // Allow 1MB tolerance
  });

  it('should not have React Router warnings in production build', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    
    render(<App />);
    
    // Check for React Router future flag warnings
    const routerWarnings = consoleSpy.mock.calls.filter(call => 
      call[0]?.includes?.('React Router Future Flag Warning')
    );
    
    // Should not have any router warnings in production-ready code
    expect(routerWarnings).toHaveLength(0);
    
    consoleSpy.mockRestore();
  });

  it('should render main components within performance budget', async () => {
    const renderTimes: number[] = [];

    for (let i = 0; i < 5; i++) {
      const startTime = performance.now();
      const { unmount } = render(<App />);
      const endTime = performance.now();
      
      renderTimes.push(endTime - startTime);
      unmount();
    }
    
    const averageRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
    const maxRenderTime = Math.max(...renderTimes);
    
    // Performance budgets
    expect(averageRenderTime).toBeLessThan(100); // Average should be under 100ms
    expect(maxRenderTime).toBeLessThan(200); // No single render should exceed 200ms
  });

  it('should not have memory leaks in component lifecycle', async () => {
    const iterations = 10;
    const memoryReadings: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const { unmount } = render(<App />);
      
      // Let component mount fully
      await new Promise(resolve => setTimeout(resolve, 50));
      
      unmount();
      
      // Force garbage collection if available
      if ((global as any).gc) {
        (global as any).gc();
      }
      
      const currentMemory = (performance as any).memory?.usedJSHeapSize || 0;
      memoryReadings.push(currentMemory);
    }
    
    // Memory should not continuously increase with each iteration
    const firstHalf = memoryReadings.slice(0, Math.floor(iterations / 2));
    const secondHalf = memoryReadings.slice(Math.floor(iterations / 2));
    
    const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    // Memory should not grow by more than 5MB over iterations
    const memoryGrowth = secondHalfAvg - firstHalfAvg;
    expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024);
  });
});