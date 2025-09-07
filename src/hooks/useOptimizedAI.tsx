import { useCallback } from 'react';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ErrorRecoveryService } from '@/services/error-recovery.service';
import { logger } from '@/utils/logger';

interface AIServiceOptions {
  context?: string;
  fallbackValue?: any;
  useCircuitBreaker?: boolean;
  maxRetries?: number;
}

/**
 * Optimized hook for AI operations with error recovery
 */
export const useOptimizedAI = () => {
  const { handleError } = useErrorHandler();

  const callAIService = useCallback(async (
    serviceCall: () => Promise<any>,
    options: AIServiceOptions = {}
  ): Promise<any> => {
    const {
      context = 'ai_service',
      fallbackValue = null,
      useCircuitBreaker = false,
      maxRetries = 2
    } = options;

    try {
      if (useCircuitBreaker) {
        return await ErrorRecoveryService.withCircuitBreaker(
          serviceCall,
          context
        );
      }

      if (fallbackValue !== null) {
        return await ErrorRecoveryService.withOpenAIFallback(
          serviceCall,
          fallbackValue,
          context
        );
      }

      return await ErrorRecoveryService.withRetry(
        serviceCall,
        { maxRetries },
        context
      );
    } catch (error) {
      logger.error('AI service call failed', { context, error });
      handleError(error, context);
      return fallbackValue;
    }
  }, [handleError]);

  const callNetworkService = useCallback(async (
    serviceCall: () => Promise<any>,
    context: string = 'network_service'
  ): Promise<any> => {
    try {
      return await ErrorRecoveryService.withNetworkResilience(
        serviceCall,
        context
      );
    } catch (error) {
      logger.error('Network service call failed', { context, error });
      handleError(error, context);
      throw error;
    }
  }, [handleError]);

  return {
    callAIService,
    callNetworkService,
  };
};