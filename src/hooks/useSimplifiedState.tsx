// Simplified state management without heavy performance monitoring
import { useState, useCallback, useMemo } from 'react';

// Lightweight optimized state hook for production
export function useOptimizedState<T>(initialValue: T) {
  const [state, setState] = useState<T>(initialValue);

  const setOptimizedState = useCallback((newValue: T | ((prev: T) => T)) => {
    setState(newValue);
  }, []);

  return useMemo(() => [state, setOptimizedState] as const, [state, setOptimizedState]);
}

// Lightweight performance hook - no monitoring overhead
export function useSimplifiedPerformance() {
  const createOptimizedCallback = useCallback(
    (fn: (...args: any[]) => any, deps: React.DependencyList) => {
      return useCallback(fn, deps);
    },
    []
  );

  return { createOptimizedCallback };
}

// Simplified memo hook
export function useSimplifiedMemo<T>(factory: () => T, deps: React.DependencyList): T {
  return useMemo(factory, deps);
}