import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { PromptService } from './prompt.service';

export interface IssueRecommendation {
  issueId: string;
  title: string;
  description?: string;
  relevanceScore: number; // 0.0 to 1.0
  explanation: string;
}

export interface IssueRecommendationRequest {
  userId: string;
  deliberationId: string;
  content: string;
  maxRecommendations?: number;
}

export class IssueRecommendationService {
  private promptService: PromptService;
  private currentDeliberationId: string = '';

  constructor() {
    this.promptService = new PromptService();
  }

  /**
   * Get issue recommendations for a user submission
   */
  async getIssueRecommendations(request: IssueRecommendationRequest): Promise<IssueRecommendation[]> {
    try {
      const { userId, deliberationId, content, maxRecommendations = 2 } = request;
      
      // Store deliberation ID for use in AI service
      this.currentDeliberationId = deliberationId;

      // Get existing issues for the deliberation
      const existingIssues = await this.getExistingIssues(deliberationId);
      
      if (existingIssues.length === 0) {
        logger.info('[IssueRecommendationService] No existing issues found for deliberation', { deliberationId });
        return [];
      }

      // Call AI service for recommendations using OpenAI
      const aiRecommendations = await this.getAIRecommendations('', content, existingIssues, userId);

      // If AI recommendations failed, use fallback
      if (!aiRecommendations || aiRecommendations.length === 0) {
        logger.warn('[IssueRecommendationService] AI recommendations failed, using fallback');
        return this.getFallbackRecommendations(existingIssues, maxRecommendations);
      }

      const validRecommendations = aiRecommendations.filter(rec => 
        rec.issueId && 
        rec.title && 
        rec.relevanceScore >= 0.6
      ).slice(0, maxRecommendations);

      // Log recommendations for debugging
      logger.info('[IssueRecommendationService] Generated recommendations', { 
        userId, 
        deliberationId, 
        count: validRecommendations.length 
      });

      return validRecommendations;
    } catch (error) {
      logger.error('[IssueRecommendationService] Error getting issue recommendations', { error, request });
      
      // Fallback to basic recommendations
      const existingIssues = await this.getExistingIssues(request.deliberationId);
      return this.getFallbackRecommendations(existingIssues, request.maxRecommendations || 2);
    }
  }

  /**
   * Get existing issues for a deliberation
   */
  private async getExistingIssues(deliberationId: string): Promise<Array<{ id: string; title: string; description?: string }>> {
    try {
      const { data, error } = await supabase
        .from('ibis_nodes')
        .select('id, title, description')
        .eq('deliberation_id', deliberationId)
        .eq('node_type', 'issue')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('[IssueRecommendationService] Error getting existing issues', { error, deliberationId });
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('[IssueRecommendationService] Unexpected error getting existing issues', { error, deliberationId });
      return [];
    }
  }

  /**
   * Format issues for the prompt template
   */
  private formatIssuesForPrompt(issues: Array<{ id: string; title: string; description?: string }>): string {
    return issues.map(issue => 
      `- ${issue.title}${issue.description ? `: ${issue.description}` : ''}`
    ).join('\n');
  }

  /**
   * Get AI recommendations using OpenAI via Supabase Edge Function with proper error handling
   * @param userId - The authenticated user ID (passed from component)
   */
  private async getAIRecommendations(
    prompt: string, 
    content: string, 
    existingIssues: Array<{ id: string; title: string; description?: string }>,
    userId: string
  ): Promise<IssueRecommendation[]> {
    try {
      logger.info('[IssueRecommendationService] Calling AI service for recommendations');

      const { data, error } = await supabase.functions.invoke('generate_issue_recommendations', {
        body: {
          deliberationId: this.currentDeliberationId,
          context: content,
          userId,
          maxRecommendations: 5
        }
      });

      if (error) {
        logger.error('[IssueRecommendationService] Edge function error', { error });
        throw error;
      }

      if (!data.recommendations || !Array.isArray(data.recommendations)) {
        logger.warn('[IssueRecommendationService] No recommendations in response', { 
          hasRecommendations: !!data.recommendations,
          success: data.success,
          dataKeys: Object.keys(data || {})
        });
        return [];
      }

      logger.info('[IssueRecommendationService] AI recommendations received', { 
        count: data.recommendations.length 
      });

      return data.recommendations.map((rec: any) => ({
        issueId: rec.issueId || `temp_${Date.now()}_${Math.random()}`,
        title: rec.title || 'Untitled Issue',
        description: rec.description || 'No description provided',
        relevanceScore: Math.max(0, Math.min(1, rec.relevanceScore || rec.relevance_score || 0.5)),
        explanation: rec.explanation || 'No explanation provided'
      }));

    } catch (error) {
      logger.error('[IssueRecommendationService] AI recommendations failed', { error });
      return [];
    }
  }

  /**
   * Fallback recommendations when AI service fails
   */
  private getFallbackRecommendations(
    issues: Array<{ id: string; title: string; description?: string }>, 
    maxCount: number
  ): IssueRecommendation[] {
    return issues.slice(0, maxCount).map((issue, index) => ({
      issueId: issue.id,
      title: issue.title,
      description: issue.description,
      relevanceScore: 0.7 - (index * 0.1), // Decreasing relevance for fallback
      explanation: 'Fallback recommendation based on recency'
    }));
  }

  /**
   * Track recommendation usage for analytics
   */
  async trackRecommendationUsage(
    userId: string, 
    deliberationId: string, 
    recommendations: IssueRecommendation[]
  ): Promise<void> {
    try {
      // This would store analytics data about which recommendations were shown
      // and potentially which ones were selected
      logger.info('[IssueRecommendationService] Tracking recommendation usage', {
        userId,
        deliberationId,
        recommendationCount: recommendations.length
      });
    } catch (error) {
      logger.error('[IssueRecommendationService] Error tracking recommendation usage', { error });
      // Don't throw - analytics failures shouldn't break the main flow
    }
  }
}
