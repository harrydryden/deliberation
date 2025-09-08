// Global performance debug provider that wraps the app
import React, { useEffect } from 'react';
import { useStreamingPerformanceMonitor } from '@/hooks/useStreamingPerformanceMonitor';
import { useNetworkPerformanceTracker } from '@/hooks/useNetworkPerformanceTracker';

interface PerformanceDebugProviderProps {
  children: React.ReactNode;
}

export const PerformanceDebugProvider: React.FC<PerformanceDebugProviderProps> = ({ children }) => {
  const networkTracker = useNetworkPerformanceTracker();

  useEffect(() => {
    // Log performance summary every 30 seconds in development
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        console.log('📊 [PERF-DEBUG] Performance Summary');
        networkTracker.logSummary();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [networkTracker]);

  // Global keyboard shortcut for performance debug
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'P') {
        console.log('🔍 [PERF-DEBUG] Manual Performance Report');
        networkTracker.logSummary();
        
        // Log memory usage
        if ('memory' in performance) {
          const memory = (performance as any).memory;
          console.log(`🧠 [PERF-DEBUG] Current Memory`, {
            used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
            total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
            limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [networkTracker]);

  return <>{children}</>;
};