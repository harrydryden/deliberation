import { useCallback } from 'react';
import { useOptimizedAI } from '@/hooks/useOptimizedAsync';
import { logger } from '@/utils/logger';

interface AIAnalysisOptions {
  timeout?: number;
  fallbackValue?: any;
  retries?: number;
}

/**
 * Optimized hook for AI analysis in IBIS submission with proper error handling
 */
export const useOptimizedAISubmission = () => {
  const { callAIService, callNetworkService } = useOptimizedAI();

  const performAIClassification = useCallback(async (
    messageContent: string,
    deliberationId: string,
    options: AIAnalysisOptions = {}
  ) => {
    const { timeout = 30000, fallbackValue = null, retries = 2 } = options;

    return callAIService(
      async () => {
        const { supabase } = await import('@/integrations/supabase/client');
        
        const { data, error } = await supabase.functions.invoke('classify_message', {
          body: {
            content: messageContent,
            deliberationId
          }
        });

        if (error) throw error;
        return data;
      },
      {
        context: 'ai_classification',
        fallbackValue,
        useCircuitBreaker: true,
        maxRetries: retries
      }
    );
  }, [callAIService]);

  const generateIssueRecommendations = useCallback(async (
    content: string,
    deliberationId: string,
    userId: string,
    options: AIAnalysisOptions = {}
  ) => {
    const { timeout = 30000, fallbackValue = [], retries = 2 } = options;

    return callAIService(
      async () => {
        const { IssueRecommendationService } = await import('@/services/domain/implementations/issue-recommendation.service');
        const service = new IssueRecommendationService();
        
        return service.getIssueRecommendations({
          userId,
          deliberationId,
          content,
          maxRecommendations: 3
        });
      },
      {
        context: 'issue_recommendations',
        fallbackValue,
        useCircuitBreaker: true,
        maxRetries: retries
      }
    );
  }, [callAIService]);

  const evaluateRelationships = useCallback(async (
    content: string,
    title: string,
    deliberationId: string,
    nodeType: string,
    options: AIAnalysisOptions = {}
  ) => {
    const { timeout = 30000, fallbackValue = [], retries = 2 } = options;

    return callAIService(
      async () => {
        const { supabase } = await import('@/integrations/supabase/client');
        
        const { data, error } = await supabase.functions.invoke('relationship_evaluator', {
          body: {
            deliberationId,
            content,
            title,
            nodeType,
            includeAllTypes: true
          }
        });

        if (error) throw error;
        return data?.relationships || [];
      },
      {
        context: 'relationship_evaluation',
        fallbackValue,
        useCircuitBreaker: true,
        maxRetries: retries
      }
    );
  }, [callAIService]);

  return {
    performAIClassification,
    generateIssueRecommendations,
    evaluateRelationships
  };
};