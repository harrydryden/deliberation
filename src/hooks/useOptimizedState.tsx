// Consolidated optimized state management - production ready
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface StateConfig<T> {
  initialValue: T;
  compare?: (prev: T, next: T) => boolean;
  debounceMs?: number;
}

// Lightweight equality check optimized for production
const deepEqual = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (let key of keysA) {
      if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  
  return false;
};

// Main optimized state hook - supports both simple and complex use cases
export function useOptimizedState<T>(configOrInitialValue: StateConfig<T> | T) {
  // Support both simple and complex usage patterns
  const config = (typeof configOrInitialValue === 'object' && 'initialValue' in configOrInitialValue) 
    ? configOrInitialValue 
    : { initialValue: configOrInitialValue as T };
    
  const { initialValue, compare = deepEqual, debounceMs = 0 } = config;
  const [state, setState] = useState<T>(initialValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastUpdateRef = useRef<T>(initialValue);

  const setOptimizedState = useCallback((newValue: T | ((prev: T) => T)) => {
    const nextValue = typeof newValue === 'function' ? (newValue as (prev: T) => T)(lastUpdateRef.current) : newValue;
    
    // Skip update if values are equal
    if (compare(lastUpdateRef.current, nextValue)) {
      return;
    }

    lastUpdateRef.current = nextValue;

    if (debounceMs > 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        setState(nextValue);
      }, debounceMs);
    } else {
      setState(nextValue);
    }
  }, [compare, debounceMs]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useMemo(() => [state, setOptimizedState] as const, [state, setOptimizedState]);
}

// Lightweight performance hook for production use
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

// Specialized hooks for common patterns
export function useOptimizedObject<T extends Record<string, any>>(initialValue: T, debounceMs?: number) {
  return useOptimizedState({
    initialValue,
    compare: deepEqual,
    debounceMs
  });
}

export function useOptimizedArray<T>(initialValue: T[], debounceMs?: number) {
  return useOptimizedState({
    initialValue,
    compare: (a, b) => a.length === b.length && a.every((item, index) => deepEqual(item, b[index])),
    debounceMs
  });
}

export function useOptimizedBoolean(initialValue: boolean = false) {
  return useOptimizedState({
    initialValue,
    compare: (a, b) => a === b
  });
}

export function useOptimizedString(initialValue: string = '', debounceMs?: number) {
  return useOptimizedState({
    initialValue,
    compare: (a, b) => a === b,
    debounceMs
  });
}