import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';

interface UseInputPreservationOptions {
  storageKey: string;
  autoSaveDelay?: number;
  preserveOnUnmount?: boolean;
}

/**
 * Hook to preserve user input across component re-renders and navigation
 * Provides automatic backup to localStorage and restoration with race condition prevention
 */
export const useInputPreservation = (options: UseInputPreservationOptions) => {
  const { storageKey, autoSaveDelay = 1000, preserveOnUnmount = true } = options;
  const [value, setValue] = useState('');
  const [isRestored, setIsRestored] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');
  const userClearTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const initialValueRef = useRef('');

  // Helper functions for sessionStorage "clearedAt" tracking
  const getClearedAtKey = (key: string) => `${key}_cleared_at`;
  
  const setUserClearedTimestamp = useCallback((timestamp: number) => {
    try {
      sessionStorage.setItem(getClearedAtKey(storageKey), timestamp.toString());
      userClearTimeRef.current = timestamp;
    } catch (error) {
      logger.error('Failed to set cleared timestamp in sessionStorage', error as Error);
    }
  }, [storageKey]);

  const getUserClearedTimestamp = useCallback((): number => {
    try {
      const stored = sessionStorage.getItem(getClearedAtKey(storageKey));
      return stored ? parseInt(stored, 10) : userClearTimeRef.current;
    } catch (error) {
      logger.error('Failed to get cleared timestamp from sessionStorage', error as Error);
      return userClearTimeRef.current;
    }
  }, [storageKey]);

  const cancelAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  // Restore from localStorage on mount with enhanced protection
  useEffect(() => {
    if (!mountedRef.current) return;
    
    try {
      const saved = localStorage.getItem(storageKey);
      const clearedTimestamp = getUserClearedTimestamp();
      const timeSinceUserClear = Date.now() - clearedTimestamp;
      
      // Enhanced protection: Don't restore if user recently cleared input (within 10 seconds)
      // or if the saved value is the same as what was cleared
      if (saved && saved.trim() && timeSinceUserClear > 10000) {
        setValue(saved);
        setIsRestored(true);
        initialValueRef.current = saved;
        logger.info('Input restored from localStorage', { 
          storageKey, 
          length: saved.length,
          timeSinceUserClear 
        });
      } else if (saved) {
        // Clear potentially stale data if user recently cleared
        localStorage.removeItem(storageKey);
        logger.debug('Cleared stale localStorage data due to recent user clear', { storageKey });
      }
    } catch (error) {
      logger.error('Failed to restore input from localStorage', error as Error);
    }
  }, [storageKey, getUserClearedTimestamp]);

  // Auto-save to localStorage with enhanced debouncing and cleanup
  useEffect(() => {
    if (!mountedRef.current || !value || value === lastSavedRef.current) return;

    // Cancel any existing timer
    cancelAutoSave();

    saveTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return; // Guard against unmounted components
      
      try {
        if (value.trim()) {
          localStorage.setItem(storageKey, value);
          lastSavedRef.current = value;
          logger.debug('Input auto-saved to localStorage', { 
            storageKey, 
            length: value.length 
          });
        }
      } catch (error) {
        logger.error('Failed to save input to localStorage', error as Error);
      }
    }, autoSaveDelay);

    return cancelAutoSave;
  }, [value, storageKey, autoSaveDelay, cancelAutoSave]);

  // Enhanced setValue with proper race condition prevention
  const setValueWithClearDetection = useCallback((newValue: string) => {
    const previousValue = value;
    
    // Detect if user intentionally cleared the input
    if (previousValue && !newValue.trim()) {
      // Cancel any pending auto-save to prevent race conditions
      cancelAutoSave();
      
      const clearTimestamp = Date.now();
      
      // Atomically clear storage and mark timestamp
      try {
        localStorage.removeItem(storageKey);
        setUserClearedTimestamp(clearTimestamp);
        lastSavedRef.current = '';
        logger.debug('User cleared input - storage and timers cleared', { 
          storageKey, 
          clearTimestamp 
        });
      } catch (error) {
        logger.error('Failed to clear storage on user clear', error as Error);
      }
    }
    
    setValue(newValue);
  }, [value, storageKey, cancelAutoSave, setUserClearedTimestamp]);

  // Enhanced storage clearing with timer cancellation
  const clearStorage = useCallback(() => {
    // Cancel any pending auto-save operations
    cancelAutoSave();
    
    try {
      localStorage.removeItem(storageKey);
      lastSavedRef.current = '';
      // Set cleared timestamp to prevent restoration
      setUserClearedTimestamp(Date.now());
      logger.debug('Input storage cleared with timer cancellation', { storageKey });
    } catch (error) {
      logger.error('Failed to clear input storage', error as Error);
    }
  }, [storageKey, cancelAutoSave, setUserClearedTimestamp]);

  // Enhanced manual save with proper error handling
  const saveToStorage = useCallback(() => {
    if (value.trim() && mountedRef.current) {
      try {
        localStorage.setItem(storageKey, value);
        lastSavedRef.current = value;
        logger.debug('Input manually saved to localStorage', { 
          storageKey, 
          length: value.length 
        });
      } catch (error) {
        logger.error('Failed to manually save input', error as Error);
      }
    }
  }, [value, storageKey]);

  // Proper cleanup on unmount using refs to prevent re-execution
  useEffect(() => {
    const currentValue = value;
    const currentLastSaved = lastSavedRef.current;
    
    return () => {
      mountedRef.current = false;
      cancelAutoSave();
      
      // Only save if preserveOnUnmount is true AND we have unsaved changes AND not empty
      if (preserveOnUnmount && 
          currentValue.trim() && 
          currentValue !== currentLastSaved &&
          currentValue !== initialValueRef.current) {
        try {
          localStorage.setItem(storageKey, currentValue);
          logger.debug('Input preserved on unmount', { 
            storageKey, 
            length: currentValue.length 
          });
        } catch (error) {
          logger.error('Failed to preserve input on unmount', error as Error);
        }
      }
    };
  }, [storageKey, preserveOnUnmount, cancelAutoSave]); // Stable dependencies only

  return {
    value,
    setValue: setValueWithClearDetection,
    isRestored,
    clearStorage,
    saveToStorage
  };
};