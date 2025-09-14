import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';

interface EnhancedKnowledgeResult {
  success: boolean;
  method: string;
  response?: {
    content: string;
    sources: Array<{
      id: string;
      title: string;
      file_name: string;
      content_type: string;
      chunk_index: number;
      similarity: number | null;
      sourceNumber: number;
    }>;
    analysis: {
      intent: string;
      complexity: string;
      confidence: number;
      entitiesFound: string[];
    } | null;
  };
  results?: Array<{
    id: string;
    agent_id: string;
    title: string;
    content: string;
    content_type: string;
    file_name: string;
    chunk_index: number;
    metadata: any;
    similarity: number | null;
    created_at: string;
  }>;
  metadata?: any;
  error?: string;
}

interface UseEnhancedKnowledgeQueryReturn {
  queryKnowledge: (query: string, agentId?: string) => Promise<EnhancedKnowledgeResult>;
  isLoading: boolean;
  backfillEmbeddings: (agentId?: string) => Promise<any>;
  getEmbeddingStats: (agentId?: string) => Promise<any>;
}

export const useEnhancedKnowledgeQuery = (): UseEnhancedKnowledgeQueryReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const queryKnowledge = async (
    query: string, 
    agentId?: string
  ): Promise<EnhancedKnowledgeResult> => {
    if (!query.trim()) {
      throw new Error('Query cannot be empty');
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('knowledge_query', {
        body: {
          query: query.trim(),
          agentId,
          maxResults: 10,
          threshold: 0.35,
          generateResponse: true // Use enhanced RAG capabilities
        }
      });

      if (error) {
        throw new Error(error.message || 'Knowledge query failed');
      }

      toast({
        title: "Knowledge Query Successful",
        description: `Found ${data?.response?.sources?.length || data?.results?.length || 0} relevant sources`,
      });

      // Handle both enhanced response format and basic results format
      if (data?.response) {
        return {
          success: data?.success || false,
          method: data?.method || 'enhanced',
          response: data.response,
          error: null,
          metadata: data?.metadata || {}
        };
      } else {
        // Transform basic response to enhanced format
        return {
          success: data?.success || false,
          method: data?.method || 'basic',
          response: {
            content: `Found ${data?.results?.length || 0} relevant documents for your query.`,
            sources: data?.results?.map((result: any, index: number) => ({
              ...result,
              sourceNumber: index + 1
            })) || [],
            analysis: null
          },
          error: null,
          metadata: data?.metadata || {}
        };
      }

    } catch (error) {
      logger.error('Knowledge query failed:', error as Error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      toast({
        title: "Knowledge Query Failed",
        description: `Failed to query knowledge: ${errorMessage}`,
        variant: "destructive",
      });

      return {
        success: false,
        method: 'error',
        response: { content: '', sources: [], analysis: null },
        error: errorMessage,
        metadata: {
          timestamp: new Date().toISOString()
        }
      };
    } finally {
      setIsLoading(false);
    }
  };

  const backfillEmbeddings = async (agentId?: string) => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('backfill_embeddings', {
        body: {
          operation: 'backfill',
          agentId,
          batchSize: 10
        }
      });

      if (error) {
        throw new Error(error.message || 'Embeddings backfill failed');
      }

      toast({
        title: "Embeddings Backfill Started",
        description: `Processing embeddings for ${agentId || 'all agents'}...`,
      });

      return data;

    } catch (error) {
      logger.error('Embeddings backfill failed:', error as Error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      toast({
        title: "Backfill Failed",
        description: `Failed to backfill embeddings: ${errorMessage}`,
        variant: "destructive",
      });

      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getEmbeddingStats = async (agentId?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('backfill_embeddings', {
        body: {
          operation: 'stats',
          agentId
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to get embedding stats');
      }

      return data;

    } catch (error) {
      logger.error('Failed to get embedding stats:', error as Error);
      throw error;
    }
  };

  return {
    queryKnowledge,
    isLoading,
    backfillEmbeddings,
    getEmbeddingStats
  };
};