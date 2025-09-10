import { useCallback, useState } from 'react';
import { productionLogger } from '@/utils/productionLogger';

interface FallbackState {
  hasFailedOver: boolean;
  fallbackReason: string | null;
  originalError: Error | null;
  fallbackStartTime: number | null;
}

interface FallbackConfig {
  maxRetries: number;
  retryDelay: number;
  fallbackTimeout: number;
}

const DEFAULT_CONFIG: FallbackConfig = {
  maxRetries: 2,
  retryDelay: 2000,
  fallbackTimeout: 30000,
};

/**
 * Hook for graceful fallback handling in AI operations
 */
export const useGracefulFallback = (config: Partial<FallbackConfig> = {}) => {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [fallbackState, setFallbackState] = useState<FallbackState>({
    hasFailedOver: false,
    fallbackReason: null,
    originalError: null,
    fallbackStartTime: null,
  });

  const triggerFallback = useCallback((reason: string, error?: Error) => {
    productionLogger.warn('Triggering graceful fallback', { reason, error: error?.message });
    
    setFallbackState({
      hasFailedOver: true,
      fallbackReason: reason,
      originalError: error || null,
      fallbackStartTime: Date.now(),
    });
  }, []);

  const resetFallback = useCallback(() => {
    setFallbackState({
      hasFailedOver: false,
      fallbackReason: null,
      originalError: null,
      fallbackStartTime: null,
    });
  }, []);

  const executeWithFallback = useCallback(async <T,>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= fullConfig.maxRetries; attempt++) {
      try {
        productionLogger.debug(`Executing ${operationName} - attempt ${attempt}`);
        return await primaryOperation();
      } catch (error) {
        lastError = error as Error;
        productionLogger.warn(`${operationName} failed - attempt ${attempt}`, {
          error: lastError.message,
          maxRetries: fullConfig.maxRetries,
        });
        
        if (attempt < fullConfig.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, fullConfig.retryDelay * attempt));
        }
      }
    }
    
    // All retries exhausted, trigger fallback
    productionLogger.error(`${operationName} failed after ${fullConfig.maxRetries} attempts, using fallback`, {
      lastError: lastError?.message,
    });
    
    triggerFallback(`${operationName} failed after retries`, lastError);
    
    try {
      return await fallbackOperation();
    } catch (fallbackError) {
      productionLogger.error(`Fallback operation also failed for ${operationName}`, {
        fallbackError: fallbackError?.message,
      });
      throw fallbackError;
    }
  }, [fullConfig, triggerFallback]);

  const generateFallbackResponse = useCallback((
    originalContent: string,
    agentType: string = 'flow_agent'
  ): string => {
    const fallbackResponses: Record<string, string> = {
      bill_agent: "I apologize, but I'm having difficulty accessing the detailed policy information right now. Based on your question about assisted dying legislation, I can share that this is a complex area with varying approaches across jurisdictions. For the most current and comprehensive information, I'd recommend checking official government sources or consulting with legal experts.",
      flow_agent: "Thank you for sharing your perspective. I'm currently experiencing some technical difficulties, but I appreciate your contribution to this discussion. Your input is valuable to the deliberation process.",
      peer_agent: "I understand you're looking for perspectives from other participants. While I'm having some technical challenges right now, I can see that deliberations often benefit from diverse viewpoints. Perhaps you could share more about your own thoughts on this topic?",
      default: "Thank you for your message. I'm experiencing some technical difficulties at the moment, but I want to acknowledge your participation in this important discussion."
    };
    
    return fallbackResponses[agentType] || fallbackResponses.default;
  }, []);

  return {
    fallbackState,
    triggerFallback,
    resetFallback,
    executeWithFallback,
    generateFallbackResponse,
  };
};