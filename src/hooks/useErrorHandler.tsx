import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';

export const useErrorHandler = () => {
  const { toast } = useToast();

  const handleError = useCallback((error: any, context?: string) => {
    // Simple error handling for performance
    const message = error?.message || 'An error occurred';
    
    logger.error(`Error${context ? ` in ${context}` : ''}`, { error, context });

    // Show generic error toast
    toast({
      variant: "destructive",
      title: context ? `Error in ${context}` : "Error",
      description: message,
    });
  }, [toast]);

  const handleAsyncError = useCallback(async (
    asyncFn: () => Promise<any>,
    context?: string
  ) => {
    try {
      return await asyncFn();
    } catch (error) {
      handleError(error, context);
      throw error;
    }
  }, [handleError]);

  return {
    handleError,
    handleAsyncError,
  };
};