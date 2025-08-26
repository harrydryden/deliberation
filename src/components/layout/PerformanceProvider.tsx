// Performance monitoring provider for global app performance
import React, { useEffect } from 'react';
import { useGlobalMemoryMonitor } from '@/hooks/useMemoryMonitor';
import { performanceMonitor } from '@/utils/performanceUtils';
import { logger } from '@/utils/logger';

interface PerformanceProviderProps {
  children: React.ReactNode;
}

export const PerformanceProvider: React.FC<PerformanceProviderProps> = ({ children }) => {
  useGlobalMemoryMonitor();

  // Set up global performance monitoring
  useEffect(() => {
    // Monitor initial page load performance
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          const metrics = {
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
            totalPageLoad: navigation.loadEventEnd - navigation.fetchStart,
            domInteractive: navigation.domInteractive - navigation.fetchStart
          };
          
          logger.performance.mark('Page load metrics', metrics);
          
          // Record each metric
          Object.entries(metrics).forEach(([name, value]) => {
            performanceMonitor.recordMetric(`page.${name}`, value);
          });
        }
      });

      // Monitor long tasks (> 50ms)
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.duration > 50) {
                logger.warn('Long task detected', {
                  duration: `${entry.duration.toFixed(2)}ms`,
                  startTime: entry.startTime
                });
                performanceMonitor.recordMetric('long-task', entry.duration);
              }
            }
          });

          observer.observe({ entryTypes: ['longtask'] });

          return () => observer.disconnect();
        } catch (error) {
          logger.warn('PerformanceObserver not fully supported', error);
        }
      }

      // Monitor layout shifts
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const cls = entry as any;
              if (cls.value > 0.1) { // CLS threshold
                logger.warn('Layout shift detected', {
                  value: cls.value,
                  sources: cls.sources?.length || 0
                });
                performanceMonitor.recordMetric('layout-shift', cls.value);
              }
            }
          });

          observer.observe({ entryTypes: ['layout-shift'] });

          return () => observer.disconnect();
        } catch (error) {
          logger.warn('Layout shift monitoring not supported', error);
        }
      }
    }
  }, []);

  // Log performance metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const metrics = performanceMonitor.getAllMetrics();
      if (Object.keys(metrics).length > 0) {
        logger.performance.mark('Performance summary', metrics);
      }
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
};