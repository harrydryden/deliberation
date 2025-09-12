import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface AIClassification {
  title: string;
  keywords: string[];
  nodeType: string;
  description: string;
  confidence: number;
  stanceScore?: number;
}

export interface RootSuggestion {
  message: string;
  action: string;
}

export const useIbisClassification = (
  messageContent: string,
  deliberationId: string,
  isModalOpen: boolean
) => {
  const [aiSuggestions, setAiSuggestions] = useState<AIClassification | null>(null);
  const [rootSuggestion, setRootSuggestion] = useState<RootSuggestion | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);

  useEffect(() => {
    if (isModalOpen && messageContent.trim()) {
      classifyMessage();
    }
  }, [isModalOpen, messageContent, deliberationId]);

  const classifyMessage = async () => {
    setIsClassifying(true);
    
    try {
      logger.info('[useIbisClassification] Starting message classification', { 
        contentLength: messageContent.length 
      });

      const { data, error } = await supabase.functions.invoke('classify_message', {
        body: {
          content: messageContent,
          deliberationId: deliberationId
        }
      });

      if (error) throw error;

      if (data && data.title) {
        setAiSuggestions({
          title: data.title,
          keywords: data.keywords,
          nodeType: data.nodeType,
          description: data.description,
          confidence: data.confidence,
          stanceScore: data.stanceScore
        });

        logger.info('[useIbisClassification] Message classified successfully', { 
          nodeType: data.nodeType,
          confidence: data.confidence 
        });
      }

      // Handle root suggestion if provided
      if (data.rootSuggestion) {
        setRootSuggestion(data.rootSuggestion);
      }

    } catch (error: any) {
      logger.error('[useIbisClassification] Error classifying message', { error });
      
      // Set fallback state for AI classification failure
      setAiSuggestions({
        title: '',
        keywords: [],
        nodeType: 'issue',
        description: 'AI analysis failed to categorize this message',
        confidence: 0,
        stanceScore: 0
      });
    } finally {
      setIsClassifying(false);
    }
  };

  return {
    aiSuggestions,
    rootSuggestion,
    isClassifying,
    refetchClassification: classifyMessage
  };
};