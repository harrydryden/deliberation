// UI state debugging to track when "Deliberating..." appears/disappears
import { useRef, useCallback, useEffect } from 'react';
import { logger } from '@/utils/logger';

interface UIStateTransition {
  timestamp: number;
  state: string;
  trigger: string;
  duration?: number;
  componentName?: string;
}

export const useUIStateDebugger = (componentName: string) => {
  const transitionsRef = useRef<UIStateTransition[]>([]);
  const currentStateRef = useRef<string>('idle');
  const stateStartTimeRef = useRef<number>(Date.now());

  // Track state transition
  const trackTransition = useCallback((newState: string, trigger: string) => {
    const now = Date.now();
    const previousState = currentStateRef.current;
    const duration = now - stateStartTimeRef.current;

    const transition: UIStateTransition = {
      timestamp: now,
      state: newState,
      trigger,
      duration,
      componentName
    };

    transitionsRef.current.push(transition);
    
    // Keep only last 50 transitions to prevent memory issues
    if (transitionsRef.current.length > 50) {
      transitionsRef.current = transitionsRef.current.slice(-50);
    }

    console.log(`🔄 [UI-DEBUG] ${componentName}: ${previousState} → ${newState}`, {
      trigger,
      duration: `${duration}ms`,
      timestamp: new Date(now).toISOString().slice(11, 23)
    });

    // Special logging for problematic states
    if (newState === 'streaming' || newState === 'deliberating') {
      console.log(`⏳ [UI-DEBUG] Started ${newState} state`, {
        componentName,
        trigger,
        expectedDuration: '< 30s'
      });
    }

    if (previousState === 'streaming' || previousState === 'deliberating') {
      const wasLongRunning = duration > 30000;
      console.log(`✅ [UI-DEBUG] Ended ${previousState} state`, {
        componentName,
        duration: `${duration}ms`,
        wasLongRunning: wasLongRunning ? '🚨 YES - INVESTIGATE' : '✅ NO',
        newState
      });

      if (wasLongRunning) {
        logger.warn(`Long-running UI state detected`, {
          componentName,
          state: previousState,
          duration,
          trigger: transition.trigger
        });
      }
    }

    currentStateRef.current = newState;
    stateStartTimeRef.current = now;
  }, [componentName]);

  // Track specific UI events
  const trackDeliberatingStart = useCallback((trigger: string) => {
    trackTransition('deliberating', trigger);
  }, [trackTransition]);

  const trackDeliberatingEnd = useCallback((trigger: string) => {
    trackTransition('idle', trigger);
  }, [trackTransition]);

  const trackStreamingStart = useCallback((trigger: string) => {
    trackTransition('streaming', trigger);
  }, [trackTransition]);

  const trackStreamingEnd = useCallback((trigger: string) => {
    trackTransition('message-complete', trigger);
  }, [trackTransition]);

  const trackError = useCallback((error: string) => {
    trackTransition('error', `error: ${error}`);
  }, [trackTransition]);

  // Get current state analytics
  const getStateAnalytics = useCallback(() => {
    const now = Date.now();
    const currentStateDuration = now - stateStartTimeRef.current;
    const recentTransitions = transitionsRef.current.slice(-10);

    return {
      currentState: currentStateRef.current,
      currentStateDuration,
      isStuck: currentStateDuration > 30000,
      recentTransitions,
      totalTransitions: transitionsRef.current.length
    };
  }, []);

  // Periodic state monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      const analytics = getStateAnalytics();
      
      if (analytics.isStuck) {
        console.warn(`🚨 [UI-DEBUG] ${componentName} stuck in "${analytics.currentState}" state`, {
          duration: `${analytics.currentStateDuration}ms`,
          lastTransitions: analytics.recentTransitions.slice(-3)
        });
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [getStateAnalytics, componentName]);

  // Component mount/unmount tracking
  useEffect(() => {
    trackTransition('mounted', 'component-mount');
    
    return () => {
      trackTransition('unmounted', 'component-unmount');
    };
  }, [trackTransition]);

  return {
    trackTransition,
    trackDeliberatingStart,
    trackDeliberatingEnd,
    trackStreamingStart,
    trackStreamingEnd,
    trackError,
    getStateAnalytics,
    getCurrentState: () => currentStateRef.current
  };
};
