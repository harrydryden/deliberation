// Performance monitoring provider for global app performance
import React, { useEffect } from 'react';
import { useGlobalMemoryMonitor } from '@/hooks/useMemoryMonitor';
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
          // Fix negative timing values by ensuring proper timing calculations
          const metrics = {
            domContentLoaded: Math.max(0, navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart),
            loadComplete: Math.max(0, navigation.loadEventEnd - navigation.loadEventStart),
            totalPageLoad: Math.max(0, navigation.loadEventEnd - navigation.fetchStart),
            domInteractive: Math.max(0, navigation.domInteractive - navigation.fetchStart)
          };
          
          // Only record metrics that are valid (non-zero and reasonable)
          const validMetrics = Object.entries(metrics).filter(([_, value]) => 
            value > 0 && value < 30000 // Less than 30 seconds is reasonable
          ).reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
          
          if (Object.keys(validMetrics).length > 0) {
            logger.performance.mark('Page load metrics', validMetrics);
            
            // Record each valid metric
            Object.entries(validMetrics).forEach(([name, value]) => {
              // performanceMonitor.recordMetric(`page.${name}`, value as number);
            });
          }
        }
      });

      // Monitor long tasks (> 50ms) with improved filtering
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              // Filter out very short or very long tasks that might be measurement errors
              if (entry.duration > 50 && entry.duration < 10000) {
                logger.warn('Long task detected', {
                  duration: `${entry.duration.toFixed(2)}ms`,
                  startTime: entry.startTime
                });
                // performanceMonitor.recordMetric('long-task', entry.duration);
              }
            }
          });

          observer.observe({ entryTypes: ['longtask'] });

          return () => observer.disconnect();
        } catch (error) {
          logger.warn('PerformanceObserver not fully supported', error);
        }
      }

      // Monitor layout shifts with improved validation
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const cls = entry as any;
              // Only report significant layout shifts
              if (cls.value > 0.1 && cls.value < 1.0) {
                logger.warn('Layout shift detected', {
                  value: cls.value,
                  sources: cls.sources?.length || 0
                });
                // performanceMonitor.recordMetric('layout-shift', cls.value);
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
      // const metrics = performanceMonitor.getAllMetrics();
      // if (Object.keys(metrics).length > 0) {
      //   logger.performance.mark('Performance summary', metrics);
      // }
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
};