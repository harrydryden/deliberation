import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';

interface UseInputPreservationOptions {
  storageKey: string;
  autoSaveDelay?: number;
  preserveOnUnmount?: boolean;
}

/**
 * Hook to preserve user input across component re-renders and navigation
 * Provides automatic backup to localStorage and restoration
 */
export const useInputPreservation = (options: UseInputPreservationOptions) => {
  const { storageKey, autoSaveDelay = 1000, preserveOnUnmount = true } = options;
  const [value, setValue] = useState('');
  const [isRestored, setIsRestored] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && saved.trim()) {
        setValue(saved);
        setIsRestored(true);
        logger.info('Input restored from localStorage', { 
          storageKey, 
          length: saved.length 
        });
      }
    } catch (error) {
      logger.error('Failed to restore input from localStorage', error as Error);
    }
  }, [storageKey]);

  // Auto-save to localStorage with debouncing
  useEffect(() => {
    if (!value || value === lastSavedRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
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

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [value, storageKey, autoSaveDelay]);

  // Clear storage when input is successfully sent
  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      lastSavedRef.current = '';
      logger.debug('Input storage cleared', { storageKey });
    } catch (error) {
      logger.error('Failed to clear input storage', error as Error);
    }
  }, [storageKey]);

  // Manual save
  const saveToStorage = useCallback(() => {
    if (value.trim()) {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Save final state if preserveOnUnmount is true
      if (preserveOnUnmount && value.trim() && value !== lastSavedRef.current) {
        try {
          localStorage.setItem(storageKey, value);
          logger.debug('Input preserved on unmount', { 
            storageKey, 
            length: value.length 
          });
        } catch (error) {
          logger.error('Failed to preserve input on unmount', error as Error);
        }
      }
    };
  }, [value, storageKey, preserveOnUnmount]);

  return {
    value,
    setValue,
    isRestored,
    clearStorage,
    saveToStorage
  };
};