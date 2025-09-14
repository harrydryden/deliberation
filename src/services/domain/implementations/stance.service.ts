import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface StanceScore {
  id: string;
  userId: string;
  deliberationId: string;
  stanceScore: number; // -1.0 to 1.0
  confidenceScore: number; // 0.0 to 1.0
  semanticAnalysis?: Record<string, unknown>;
  lastUpdated: string;
  createdAt: string;
  updatedAt: string;
}

export interface StanceSummary {
  totalUsers: number;
  averageStance: number;
  positiveUsers: number;
  negativeUsers: number;
  neutralUsers: number;
  averageConfidence: number;
}

export interface StanceTrend {
  date: string;
  stanceScore: number;
  confidenceScore: number;
}

export class StanceService {
  /**
   * Create or update a user's stance score for a deliberation
   */
  async updateStanceScore(
    userId: string, 
    deliberationId: string, 
    stanceScore: number, 
    confidenceScore: number,
    semanticAnalysis?: Record<string, unknown>
  ): Promise<StanceScore> {
    try {
      const { data, error } = await supabase
        .from('user_stance_scores')
        .upsert(
          {
            user_id: userId,
            deliberation_id: deliberationId,
            stance_score: stanceScore,
            confidence_score: confidenceScore,
            semantic_analysis: semanticAnalysis,
            last_updated: new Date().toISOString()
          },
          { onConflict: 'user_id,deliberation_id' }
        )
        .select()
        .single();

      if (error) {
        logger.error('[StanceService] Error updating stance score', { error, userId, deliberationId });
        throw new Error(`Failed to update stance score: ${error.message}`);
      }

      return {
        id: data.id,
        userId: data.user_id,
        deliberationId: data.deliberation_id,
        stanceScore: data.stance_score,
        confidenceScore: data.confidence_score,
        semanticAnalysis: data.semantic_analysis,
        lastUpdated: data.last_updated,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      logger.error('[StanceService] Unexpected error updating stance score', { error, userId, deliberationId });
      throw error;
    }
  }

  /**
   * Get a user's stance score for a deliberation
   */
  async getUserStanceScore(userId: string, deliberationId: string): Promise<StanceScore | null> {
    try {
      const { data, error } = await supabase
        .from('user_stance_scores')
        .select('*')
        .eq('user_id', userId)
        .eq('deliberation_id', deliberationId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('[StanceService] Error getting user stance score', { error, userId, deliberationId });
        throw new Error(`Failed to get stance score: ${error.message}`);
      }

      if (!data) return null;

      return {
        id: data.id,
        userId: data.user_id,
        deliberationId: data.deliberation_id,
        stanceScore: data.stance_score,
        confidenceScore: data.confidence_score,
        semanticAnalysis: data.semantic_analysis,
        lastUpdated: data.last_updated,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      logger.error('[StanceService] Unexpected error getting user stance score', { error, userId, deliberationId });
      throw error;
    }
  }

  /**
   * Get deliberation stance summary
   */
  async getDeliberationStanceSummary(deliberationId: string): Promise<StanceSummary> {
    try {
      const { data, error } = await supabase
        .rpc('get_deliberation_stance_summary', { deliberation_uuid: deliberationId });

      if (error) {
        logger.error('[StanceService] Error getting deliberation stance summary', { error, deliberationId });
        throw new Error(`Failed to get stance summary: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return {
          totalUsers: 0,
          averageStance: 0,
          positiveUsers: 0,
          negativeUsers: 0,
          neutralUsers: 0,
          averageConfidence: 0,
        };
      }

      const summary = data[0];
      return {
        totalUsers: Number(summary.total_users),
        averageStance: Number(summary.average_stance),
        positiveUsers: Number(summary.positive_users),
        negativeUsers: Number(summary.negative_users),
        neutralUsers: Number(summary.neutral_users),
        averageConfidence: Number(summary.average_confidence),
      };
    } catch (error) {
      logger.error('[StanceService] Unexpected error getting deliberation stance summary', { error, deliberationId });
      throw error;
    }
  }

  /**
   * Get user's stance trend over time
   */
  async getUserStanceTrend(userId: string, deliberationId: string): Promise<StanceTrend[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_user_stance_trend', { 
          user_uuid: userId, 
          deliberation_uuid: deliberationId 
        });

      if (error) {
        logger.error('[StanceService] Error getting user stance trend', { error, userId, deliberationId });
        throw new Error(`Failed to get stance trend: ${error.message}`);
      }

      return data.map(trend => ({
        date: trend.date,
        stanceScore: Number(trend.stance_score),
        confidenceScore: Number(trend.confidence_score),
      }));
    } catch (error) {
      logger.error('[StanceService] Unexpected error getting user stance trend', { error, userId, deliberationId });
      throw error;
    }
  }

  /**
   * Get all stance scores for admin view
   */
  async getAllStanceScores(): Promise<Array<StanceScore & { user: { email: string }, deliberation: { title: string } }>> {
    try {
      const { data, error } = await supabase
        .from('user_stance_scores')
        .select(`
          *
        `)
        .order('updated_at', { ascending: false });

      if (error) {
        logger.error('[StanceService] Error getting all stance scores', { error });
        throw new Error(`Failed to get all stance scores: ${error.message}`);
      }

      return data.map(score => ({
        id: score.id,
        userId: score.user_id,
        deliberationId: score.deliberation_id,
        stanceScore: score.stance_score,
        confidenceScore: score.confidence_score,
        semanticAnalysis: score.semantic_analysis,
        lastUpdated: score.last_updated,
        createdAt: score.created_at,
        updatedAt: score.updated_at,
        user: { email: 'Unknown' },
        deliberation: { title: 'Unknown' },
      }));
    } catch (error) {
      logger.error('[StanceService] Unexpected error getting all stance scores', { error });
      throw error;
    }
  }

  /**
   * Calculate stance score from semantic analysis using AI
   */
  async calculateStanceFromSemantic(
    userId: string,
    deliberationId: string,
    content: string
  ): Promise<{ stanceScore: number; confidenceScore: number; semanticAnalysis: Record<string, unknown> }> {
    try {
      logger.info('[StanceService] Calculating stance from user messages', { userId, deliberationId });

      // Call the AI-powered stance calculation edge function
      const { data, error } = await supabase.functions.invoke('calculate_user_stance', {
        body: { 
          userId, 
          deliberationId 
        }
      });

      if (error) {
        logger.error('[StanceService] Error calling stance calculation function', { error, userId, deliberationId });
        throw new Error(`Failed to calculate stance: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from stance calculation');
      }

      logger.info('[StanceService] Stance calculation completed', { 
        userId, 
        deliberationId, 
        stanceScore: data.stanceScore,
        confidenceScore: data.confidenceScore,
        messageCount: data.messageCount 
      });

      return {
        stanceScore: data.stanceScore,
        confidenceScore: data.confidenceScore,
        semanticAnalysis: {
          reasoning: data.reasoning,
          keyIndicators: data.keyIndicators || [],
          messageCount: data.messageCount,
          analysisTimestamp: data.analysisTimestamp,
          analysisDetails: data.analysisDetails,
          aiModel: 'gpt-4o-mini', // Match the actual model used in edge function
          analysisSource: 'ai-powered'
        }
      };
    } catch (error) {
      logger.error('[StanceService] Error calculating stance from semantic analysis', { error, userId, deliberationId });
      
      // Fallback to existing stance if available
      try {
        const existingStance = await this.getUserStanceScore(userId, deliberationId);
        if (existingStance) {
          logger.info('[StanceService] Using existing stance as fallback', { userId, deliberationId });
            return {
              stanceScore: existingStance.stanceScore,
              confidenceScore: existingStance.confidenceScore,
              semanticAnalysis: {
                ...existingStance.semanticAnalysis,
                fallbackReason: 'AI analysis failed, using existing stance',
                analysisSource: 'fallback-existing',
                error: error.message
              }
            };
        }
      } catch (fallbackError) {
        logger.error('[StanceService] Fallback also failed', { fallbackError, userId, deliberationId });
      }

      // Final fallback to neutral if everything fails
      return {
        stanceScore: 0.0,
        confidenceScore: 0.1, // Lower confidence for fallback
        semanticAnalysis: {
          error: error.message,
          fallbackReason: 'AI analysis failed, using neutral default',
          analysisSource: 'fallback-default',
          analysisTimestamp: new Date().toISOString()
        }
      };
    }
  }

}
