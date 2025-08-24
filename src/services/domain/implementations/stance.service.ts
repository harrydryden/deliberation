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
          *,
          user:auth.users(email),
          deliberation:deliberations(title)
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
        user: { email: score.user?.email || 'Unknown' },
        deliberation: { title: score.deliberation?.title || 'Unknown' },
      }));
    } catch (error) {
      logger.error('[StanceService] Unexpected error getting all stance scores', { error });
      throw error;
    }
  }

  /**
   * Calculate stance score from semantic analysis
   */
  async calculateStanceFromSemantic(
    userId: string,
    deliberationId: string,
    content: string
  ): Promise<{ stanceScore: number; confidenceScore: number; semanticAnalysis: Record<string, unknown> }> {
    try {
      // This would typically call an AI service for semantic analysis
      // For now, we'll use a simplified approach
      
      // Simulate AI analysis (replace with actual AI call)
      const analysis = await this.performSemanticAnalysis(content);
      
      // Calculate stance score based on analysis
      const stanceScore = this.calculateStanceScore(analysis);
      const confidenceScore = this.calculateConfidenceScore(analysis);
      
      return {
        stanceScore,
        confidenceScore,
        semanticAnalysis: analysis
      };
    } catch (error) {
      logger.error('[StanceService] Error calculating stance from semantic analysis', { error, userId, deliberationId });
      throw error;
    }
  }

  /**
   * Perform semantic analysis on content
   */
  private async performSemanticAnalysis(content: string): Promise<Record<string, unknown>> {
    // This would call OpenAI or similar service
    // For now, return a mock analysis
    return {
      sentiment: 'neutral',
      topics: ['general'],
      confidence: 0.7,
      analysis_timestamp: new Date().toISOString(),
      content_length: content.length,
      // Add more semantic analysis fields as needed
    };
  }

  /**
   * Calculate stance score from semantic analysis
   */
  private calculateStanceScore(analysis: Record<string, unknown>): number {
    // This would use the actual semantic analysis results
    // For now, return a neutral score
    return 0.0;
  }

  /**
   * Calculate confidence score from semantic analysis
   */
  private calculateConfidenceScore(analysis: Record<string, unknown>): number {
    // This would use the actual semantic analysis results
    // For now, return a moderate confidence
    return 0.7;
  }
}
