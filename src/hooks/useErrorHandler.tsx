import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage, isAuthError } from '@/utils/errors';
import { useBackendAuth } from '@/hooks/useBackendAuth';

export const useErrorHandler = () => {
  const { toast } = useToast();
  const { signOut } = useBackendAuth();

  const handleError = useCallback((error: any, context?: string) => {
    const message = getErrorMessage(error);
    
    console.error(`Error${context ? ` in ${context}` : ''}:`, error);

    // Handle authentication errors
    if (isAuthError(error)) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "Please sign in again",
      });
      signOut();
      return;
    }

    // Handle general errors
    toast({
      variant: "destructive",
      title: context ? `Error in ${context}` : "Error",
      description: message,
    });
  }, [toast, signOut]);

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