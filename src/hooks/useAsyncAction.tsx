import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';

interface UseAsyncActionOptions {
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: () => void;
}

export const useAsyncAction = <T extends any[], R = void>(
  action: (...args: T) => Promise<R>,
  options: UseAsyncActionOptions = {}
) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (...args: T): Promise<R | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await action(...args);
      
      if (options.successMessage) {
        toast.success(options.successMessage);
      }
      
      if (options.onSuccess) {
        options.onSuccess();
      }
      
      return result;
    } catch (err) {
      const message = (err as Error)?.message || options.errorMessage || 'Operation failed';
      setError(message);
      toast.error(message);
      logger.error('Async action failed', err as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [action, options]);

  return {
    execute,
    loading,
    error,
    clearError: () => setError(null)
  };
};