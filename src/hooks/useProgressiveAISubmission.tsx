import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { performanceMonitor } from '@/utils/performanceMonitor';

interface AIClassification {
  title: string;
  keywords: string[];
  nodeType: string;
  description: string;
  confidence: number;
  stanceScore?: number;
}

interface IssueRecommendation {
  issueId: string;
  title: string;
  description?: string;
  relevanceScore: number;
  explanation: string;
}

interface SmartRelationship {
  id: string;
  type: string;
  confidence: number;
  // Additional properties from relationship evaluation
  targetNodeId?: string;
  targetNodeTitle?: string;
  title?: string;
  nodeType?: string;
  similarity?: number;
  strength?: number;
}

interface ProgressiveAIState {
  classification: {
    data: AIClassification | null;
    loading: boolean;
    error: string | null;
  };
  issueRecommendations: {
    data: IssueRecommendation[];
    loading: boolean;
    error: string | null;
  };
  relationships: {
    data: SmartRelationship[];
    loading: boolean;
    error: string | null;
  };
}

/**
 * Progressive AI loading hook - loads AI suggestions in background without blocking UI
 */
export const useProgressiveAISubmission = (
  messageContent: string,
  deliberationId: string,
  isModalOpen: boolean
) => {
  const [aiState, setAiState] = useState<ProgressiveAIState>({
    classification: { data: null, loading: false, error: null },
    issueRecommendations: { data: [], loading: false, error: null },
    relationships: { data: [], loading: false, error: null }
  });

  // Cancellation refs for cleanup
  const classificationRef = useRef<AbortController | null>(null);
  const issueRecRef = useRef<AbortController | null>(null);
  const relationshipsRef = useRef<AbortController | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setAiState({
        classification: { data: null, loading: false, error: null },
        issueRecommendations: { data: [], loading: false, error: null },
        relationships: { data: [], loading: false, error: null }
      });
    } else {
      // Cancel all ongoing requests when modal closes
      cancelAllRequests();
    }
  }, [isModalOpen]);

  // Start AI processing when modal opens and content is available
  useEffect(() => {
    if (isModalOpen && messageContent.trim()) {
      startProgressiveLoading();
    }
  }, [isModalOpen, messageContent]);

  const cancelAllRequests = () => {
    [classificationRef, issueRecRef, relationshipsRef].forEach(ref => {
      if (ref.current) {
        ref.current.abort();
        ref.current = null;
      }
    });
  };

  const startProgressiveLoading = () => {
    // Start classification immediately (fastest, most useful)
    startClassification();
    
    // Start issue recommendations in parallel
    setTimeout(() => startIssueRecommendations(), 100);
    
    // Start relationship evaluation last (least critical for initial form)
    setTimeout(() => startRelationshipEvaluation(), 200);
  };

  const startClassification = async () => {
    if (classificationRef.current) return; // Already running

    classificationRef.current = new AbortController();
    
    setAiState(prev => ({
      ...prev,
      classification: { ...prev.classification, loading: true, error: null }
    }));

    try {
      performanceMonitor.mark('ai-classification-start');
      
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('classify_message', {
        body: { content: messageContent, deliberationId }
      });

      if (error) throw error;

      performanceMonitor.measure('ai-classification', 'ai-classification-start');

      // Build a robust classification object even if some fields are missing
      const computedTitle = (typeof data?.title === 'string' && data.title.trim().length > 0)
        ? data.title.trim()
        : messageContent.trim().slice(0, 100) + (messageContent.trim().length > 100 ? '...' : '');

      // Normalize stance from 0..1 (edge function) to -1..1 (UI expects)
      const rawStance = typeof data?.stanceScore === 'number' ? Math.max(0, Math.min(1, data.stanceScore)) : null;
      const normalizedStance = rawStance === null ? undefined : (rawStance - 0.5) * 2;

      setAiState(prev => ({
        ...prev,
        classification: {
          data: {
            title: computedTitle,
            keywords: Array.isArray(data?.keywords) ? data.keywords : [],
            nodeType: typeof data?.nodeType === 'string' ? data.nodeType : 'issue',
            description: typeof data?.description === 'string' && data.description.trim() ? data.description : 'AI analysis of your message',
            confidence: typeof data?.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.6,
            stanceScore: normalizedStance
          },
          loading: false,
          error: null
        }
      }));
      
      logger.info('[ProgressiveAI] Classification completed', { 
        nodeType: data?.nodeType, 
        confidence: data?.confidence 
      });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        logger.warn('[ProgressiveAI] Classification failed', { error });
        setAiState(prev => ({
          ...prev,
          classification: { 
            data: null, 
            loading: false, 
            error: 'Classification failed' 
          }
        }));
      }
    } finally {
      classificationRef.current = null;
    }
  };

  const startIssueRecommendations = async () => {
    if (issueRecRef.current) return;

    issueRecRef.current = new AbortController();
    
    setAiState(prev => ({
      ...prev,
      issueRecommendations: { ...prev.issueRecommendations, loading: true, error: null }
    }));

    try {
      performanceMonitor.mark('issue-recommendations-start');
      
      const { IssueRecommendationService } = await import('@/services/domain/implementations/issue-recommendation.service');
      const service = new IssueRecommendationService();
      
      const recommendations = await service.getIssueRecommendations({
        userId: 'temp-user', // Will be replaced with actual user ID
        deliberationId,
        content: messageContent,
        maxRecommendations: 3
      });

      performanceMonitor.measure('issue-recommendations', 'issue-recommendations-start');

      setAiState(prev => ({
        ...prev,
        issueRecommendations: {
          data: recommendations,
          loading: false,
          error: null
        }
      }));

      logger.info('[ProgressiveAI] Issue recommendations completed', { 
        count: recommendations.length 
      });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        logger.warn('[ProgressiveAI] Issue recommendations failed', { error });
        setAiState(prev => ({
          ...prev,
          issueRecommendations: { 
            data: [], 
            loading: false, 
            error: 'Recommendations failed' 
          }
        }));
      }
    } finally {
      issueRecRef.current = null;
    }
  };

  const startRelationshipEvaluation = async () => {
    if (relationshipsRef.current) return;

    relationshipsRef.current = new AbortController();
    
    setAiState(prev => ({
      ...prev,
      relationships: { ...prev.relationships, loading: true, error: null }
    }));

    try {
      performanceMonitor.mark('relationships-start');
      
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('relationship_evaluator', {
        body: {
          deliberationId,
          content: messageContent,
          title: aiState.classification.data?.title || 'Untitled',
          nodeType: aiState.classification.data?.nodeType || 'issue',
          includeAllTypes: true
        }
      });

      if (error) throw error;

      performanceMonitor.measure('relationships', 'relationships-start');

      const relationships = data?.relationships || [];
      
      setAiState(prev => ({
        ...prev,
        relationships: {
          data: relationships,
          loading: false,
          error: null
        }
      }));

      logger.info('[ProgressiveAI] Relationship evaluation completed', { 
        count: relationships.length 
      });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        logger.warn('[ProgressiveAI] Relationship evaluation failed', { error });
        setAiState(prev => ({
          ...prev,
          relationships: { 
            data: [], 
            loading: false, 
            error: 'Relationship evaluation failed' 
          }
        }));
      }
    } finally {
      relationshipsRef.current = null;
    }
  };

  const retryOperation = useCallback((operation: 'classification' | 'issueRecommendations' | 'relationships') => {
    switch (operation) {
      case 'classification':
        startClassification();
        break;
      case 'issueRecommendations':
        startIssueRecommendations();
        break;
      case 'relationships':
        startRelationshipEvaluation();
        break;
    }
  }, [messageContent, deliberationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAllRequests();
    };
  }, []);

  return {
    aiState,
    retryOperation,
    isAnyLoading: aiState.classification.loading || aiState.issueRecommendations.loading || aiState.relationships.loading
  };
};