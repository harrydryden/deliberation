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
    // F009 Fix: Only log performance summary when there's activity, reduce frequency
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        const metrics = networkTracker.getAllMetrics();
        const recentActivity = metrics.filter(m => 
          m.endTime && Date.now() - m.endTime < 120000 // Activity in last 2 minutes
        );
        
        if (recentActivity.length > 0) {
          console.log('📊 [PERF-DEBUG] Performance Summary');
          networkTracker.logSummary();
        }
      }, 60000); // Reduced to every 60 seconds

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