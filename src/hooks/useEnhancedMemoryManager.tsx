/**
 * Enhanced Memory Manager Hook - Production Ready
 * Comprehensive memory management with leak detection and cleanup
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { logger } from '@/utils/logger';
import { enhancedErrorReporting } from '@/utils/enhancedErrorReporting';

interface MemoryStats {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercent: number;
  growth: number;
  leakSuspected: boolean;
}

interface MemoryManagerConfig {
  thresholdMB: number;
  leakDetectionWindow: number;
  checkInterval: number;
  autoCleanup: boolean;
  aggressiveMode: boolean;
}

interface CleanupTask {
  id: string;
  callback: () => void | Promise<void>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

interface ResourceTracker {
  intervals: Set<NodeJS.Timeout>;
  timeouts: Set<NodeJS.Timeout>;
  eventListeners: Array<{ element: EventTarget; event: string; handler: EventListener }>;
  observers: Set<ResizeObserver | IntersectionObserver | MutationObserver>;
  abortControllers: Set<AbortController>;
  subscriptions: Set<{ unsubscribe: () => void }>;
}

const DEFAULT_CONFIG: MemoryManagerConfig = {
  thresholdMB: 150,
  leakDetectionWindow: 60000, // 1 minute
  checkInterval: 15000, // 15 seconds
  autoCleanup: true,
  aggressiveMode: false
};

export const useEnhancedMemoryManager = (
  componentName: string,
  config: Partial<MemoryManagerConfig> = {}
) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [isUnderPressure, setIsUnderPressure] = useState(false);

  // Resource tracking
  const resourceTracker = useRef<ResourceTracker>({
    intervals: new Set(),
    timeouts: new Set(),
    eventListeners: [],
    observers: new Set(),
    abortControllers: new Set(),
    subscriptions: new Set()
  });

  // Cleanup tasks registry
  const cleanupTasks = useRef<Map<string, CleanupTask>>(new Map());
  
  // Memory monitoring
  const memoryHistory = useRef<Array<{ timestamp: number; usage: number }>>([]);
  const monitoringInterval = useRef<NodeJS.Timeout | null>(null);
  const componentMountTime = useRef<number>(Date.now());

  const getMemoryStats = useCallback((): MemoryStats => {
    const performance = (window as any).performance;
    const memory = performance?.memory;
    
    if (!memory) {
      return {
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0,
        usagePercent: 0,
        growth: 0,
        leakSuspected: false
      };
    }

    const usedMB = memory.usedJSHeapSize / (1024 * 1024);
    const totalMB = memory.totalJSHeapSize / (1024 * 1024);
    const limitMB = memory.jsHeapSizeLimit / (1024 * 1024);
    const usagePercent = (usedMB / limitMB) * 100;

    // Calculate growth trend
    const history = memoryHistory.current;
    const now = Date.now();
    const growth = history.length > 1 
      ? usedMB - history[history.length - 1].usage 
      : 0;

    // Detect potential memory leaks
    const recentHistory = history.filter(h => now - h.timestamp < finalConfig.leakDetectionWindow);
    const leakSuspected = recentHistory.length > 5 && 
      recentHistory.every((h, i) => i === 0 || h.usage > recentHistory[i - 1].usage);

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usagePercent,
      growth,
      leakSuspected
    };
  }, [finalConfig.leakDetectionWindow]);

  const trackInterval = useCallback((interval: NodeJS.Timeout): NodeJS.Timeout => {
    resourceTracker.current.intervals.add(interval);
    return interval;
  }, []);

  const trackTimeout = useCallback((timeout: NodeJS.Timeout): NodeJS.Timeout => {
    resourceTracker.current.timeouts.add(timeout);
    return timeout;
  }, []);

  const trackEventListener = useCallback((
    element: EventTarget,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ) => {
    element.addEventListener(event, handler, options);
    resourceTracker.current.eventListeners.push({ element, event, handler });
    return () => element.removeEventListener(event, handler);
  }, []);

  const trackObserver = useCallback((observer: ResizeObserver | IntersectionObserver | MutationObserver) => {
    resourceTracker.current.observers.add(observer);
    return observer;
  }, []);

  const trackAbortController = useCallback((controller: AbortController): AbortController => {
    resourceTracker.current.abortControllers.add(controller);
    return controller;
  }, []);

  const trackSubscription = useCallback((subscription: { unsubscribe: () => void }) => {
    resourceTracker.current.subscriptions.add(subscription);
    return subscription;
  }, []);

  const registerCleanupTask = useCallback((task: CleanupTask) => {
    cleanupTasks.current.set(task.id, task);
    
    return () => {
      cleanupTasks.current.delete(task.id);
    };
  }, []);

  const executeCleanup = useCallback(async (priority?: CleanupTask['priority']) => {
    const tasks = Array.from(cleanupTasks.current.values());
    const sortedTasks = tasks
      .filter(task => !priority || task.priority === priority)
      .sort((a, b) => {
        const priorities = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorities[b.priority] - priorities[a.priority];
      });

    let executedCount = 0;
    const errors: Error[] = [];

    for (const task of sortedTasks) {
      try {
        await task.callback();
        executedCount++;
        logger.debug(`Cleanup task executed: ${task.description}`);
      } catch (error) {
        errors.push(error as Error);
        logger.error(`Cleanup task failed: ${task.description}`, error as Error);
      }
    }

    // Clean up tracked resources
    await cleanupTrackedResources();

    logger.info(`Memory cleanup completed for ${componentName}`, {
      executedTasks: executedCount,
      errors: errors.length,
      priority: priority || 'all'
    });

    return { executedCount, errors };
  }, [componentName]);

  const cleanupTrackedResources = useCallback(async () => {
    const tracker = resourceTracker.current;
    if (!tracker) return;
    
    let cleanedCount = 0;

    // Clear intervals
    tracker.intervals.forEach(interval => {
      clearInterval(interval);
      cleanedCount++;
    });
    tracker.intervals.clear();

    // Clear timeouts
    tracker.timeouts.forEach(timeout => {
      clearTimeout(timeout);
      cleanedCount++;
    });
    tracker.timeouts.clear();

    // Remove event listeners
    tracker.eventListeners.forEach(({ element, event, handler }) => {
      try {
        element.removeEventListener(event, handler);
        cleanedCount++;
      } catch (error) {
        logger.debug('Failed to remove event listener', { error });
      }
    });
    tracker.eventListeners = [];

    // Disconnect observers
    tracker.observers.forEach(observer => {
      try {
        observer.disconnect();
        cleanedCount++;
      } catch (error) {
        logger.debug('Failed to disconnect observer', { error });
      }
    });
    tracker.observers.clear();

    // Abort controllers
    tracker.abortControllers.forEach(controller => {
      try {
        if (!controller.signal.aborted) {
          controller.abort();
          cleanedCount++;
        }
      } catch (error) {
        logger.debug('Failed to abort controller', { error });
      }
    });
    tracker.abortControllers.clear();

    // Unsubscribe subscriptions
    tracker.subscriptions.forEach(subscription => {
      try {
        subscription.unsubscribe();
        cleanedCount++;
      } catch (error) {
        logger.debug('Failed to unsubscribe', { error });
      }
    });
    tracker.subscriptions.clear();

    logger.debug(`Cleaned up ${cleanedCount} tracked resources for ${componentName}`);
  }, [componentName]);

  const checkMemoryPressure = useCallback(() => {
    const stats = getMemoryStats();
    const usedMB = stats.usedJSHeapSize / (1024 * 1024);
    const now = Date.now();

    // Update memory history
    memoryHistory.current.push({ timestamp: now, usage: usedMB });
    
    // Keep only recent history
    const cutoff = now - finalConfig.leakDetectionWindow * 2;
    memoryHistory.current = memoryHistory.current.filter(h => h.timestamp > cutoff);

    // Update state
    setMemoryStats(stats);
    const underPressure = usedMB > finalConfig.thresholdMB;
    setIsUnderPressure(underPressure);

    // Handle memory pressure
    if (underPressure || stats.leakSuspected) {
      logger.warn(`Memory pressure detected in ${componentName}`, {
        usedMB: usedMB.toFixed(1),
        threshold: finalConfig.thresholdMB,
        usagePercent: stats.usagePercent.toFixed(1),
        growth: stats.growth.toFixed(1),
        leakSuspected: stats.leakSuspected
      });

      enhancedErrorReporting.reportMemoryIssue(usedMB, finalConfig.thresholdMB, {
        component: componentName,
        stats,
        trackedResources: {
          intervals: resourceTracker.current.intervals.size,
          timeouts: resourceTracker.current.timeouts.size,
          listeners: resourceTracker.current.eventListeners.length,
          observers: resourceTracker.current.observers.size,
          controllers: resourceTracker.current.abortControllers.size,
          subscriptions: resourceTracker.current.subscriptions.size
        }
      });

      if (finalConfig.autoCleanup) {
        const priority = stats.leakSuspected || usedMB > finalConfig.thresholdMB * 1.5 
          ? 'high' 
          : 'medium';
        executeCleanup(priority);
      }
    }

    return stats;
  }, [componentName, finalConfig, getMemoryStats, executeCleanup]);

  const forceGarbageCollection = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).gc) {
      try {
        (window as any).gc();
        logger.debug('Forced garbage collection');
      } catch (error) {
        logger.debug('Garbage collection not available');
      }
    }
  }, []);

  // Start memory monitoring
  useEffect(() => {
    logger.info(`Enhanced memory manager initialized for ${componentName}`, finalConfig);

    monitoringInterval.current = setInterval(checkMemoryPressure, finalConfig.checkInterval);

    // Initial check
    checkMemoryPressure();

    return () => {
      if (monitoringInterval.current) {
        clearInterval(monitoringInterval.current);
      }
    };
  }, [componentName, finalConfig.checkInterval, checkMemoryPressure]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const lifespan = Date.now() - componentMountTime.current;
      
      logger.info(`Component ${componentName} unmounting after ${lifespan}ms`);
      
      // Execute all cleanup tasks
      executeCleanup().finally(() => {
        // Force garbage collection
        if (finalConfig.aggressiveMode) {
          forceGarbageCollection();
        }
      });
    };
  }, [componentName, executeCleanup, finalConfig.aggressiveMode, forceGarbageCollection]);

  return {
    // Memory stats
    memoryStats,
    isUnderPressure,
    
    // Resource tracking
    trackInterval,
    trackTimeout,
    trackEventListener,
    trackObserver,
    trackAbortController,
    trackSubscription,
    
    // Cleanup management
    registerCleanupTask,
    executeCleanup,
    forceGarbageCollection,
    
    // Monitoring
    checkMemoryPressure,
    getMemoryStats,
    
    // Utilities
    isLeakSuspected: () => memoryStats?.leakSuspected ?? false,
    getResourceCount: () => ({
      intervals: resourceTracker.current.intervals.size,
      timeouts: resourceTracker.current.timeouts.size,
      listeners: resourceTracker.current.eventListeners.length,
      observers: resourceTracker.current.observers.size,
      controllers: resourceTracker.current.abortControllers.size,
      subscriptions: resourceTracker.current.subscriptions.size,
      cleanupTasks: cleanupTasks.current.size
    })
  };
};
