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

  constructor() {
    this.promptService = new PromptService();
  }

  /**
   * Get issue recommendations for a user submission
   */
  async getIssueRecommendations(request: IssueRecommendationRequest): Promise<IssueRecommendation[]> {
    try {
      const { userId, deliberationId, content, maxRecommendations = 2 } = request;

      // Get existing issues for the deliberation
      const existingIssues = await this.getExistingIssues(deliberationId);
      
      if (existingIssues.length === 0) {
        logger.info('[IssueRecommendationService] No existing issues found for deliberation', { deliberationId });
        return [];
      }

      // Get the issue recommendation prompt template
      const promptTemplate = await this.promptService.getIssueRecommendationPrompt();
      if (!promptTemplate) {
        logger.warn('[IssueRecommendationService] Issue recommendation prompt template not found');
        return this.getFallbackRecommendations(existingIssues, maxRecommendations);
      }

      // Prepare variables for the prompt
      const variables = {
        user_submission: content,
        available_issues: this.formatIssuesForPrompt(existingIssues)
      };

      // Validate variables
      const validationErrors = this.promptService.validatePromptVariables(promptTemplate, variables);
      if (validationErrors.length > 0) {
        logger.error('[IssueRecommendationService] Prompt validation errors', { errors: validationErrors });
        return this.getFallbackRecommendations(existingIssues, maxRecommendations);
      }

      // Render the prompt
      const renderedPrompt = this.promptService.renderPrompt(promptTemplate, variables);

      // Call AI service for recommendations (this would be implemented with OpenAI or similar)
      const aiRecommendations = await this.getAIRecommendations(renderedPrompt, content, existingIssues);

      // Process and validate AI recommendations
      const recommendations = this.processAIRecommendations(aiRecommendations, existingIssues, maxRecommendations);

      // Log recommendations for debugging
      logger.info('[IssueRecommendationService] Generated recommendations', { 
        userId, 
        deliberationId, 
        count: recommendations.length 
      });

      return recommendations;
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
        .eq('is_active', true)
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
   * Get AI recommendations (placeholder for OpenAI integration)
   */
  private async getAIRecommendations(
    prompt: string, 
    content: string, 
    existingIssues: Array<{ id: string; title: string; description?: string }>
  ): Promise<string> {
    // This would call OpenAI or similar AI service
    // For now, return a mock response
    logger.info('[IssueRecommendationService] Would call AI service with prompt', { promptLength: prompt.length });
    
    // Simulate AI response based on content similarity
    return this.simulateAIResponse(content, existingIssues);
  }

  /**
   * Simulate AI response for development/testing
   */
  private simulateAIResponse(
    content: string, 
    issues: Array<{ id: string; title: string; description?: string }>
  ): string {
    if (issues.length === 0) return 'No relevant issues found.';

    // Simple keyword matching simulation
    const contentLower = content.toLowerCase();
    const scoredIssues = issues.map(issue => {
      const issueText = `${issue.title} ${issue.description || ''}`.toLowerCase();
      let score = 0;
      
      // Simple word overlap scoring
      const contentWords = contentLower.split(/\s+/);
      const issueWords = issueText.split(/\s+/);
      
      for (const word of contentWords) {
        if (word.length > 3 && issueWords.includes(word)) {
          score += 0.1;
        }
      }
      
      return { ...issue, score: Math.min(score, 1.0) };
    });

    // Sort by score and take top 2
    const topIssues = scoredIssues
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .filter(issue => issue.score > 0.1);

    if (topIssues.length === 0) {
      return 'No relevant issues found.';
    }

    return topIssues.map((issue, index) => 
      `- Recommended Issue ${index + 1}: ${issue.title} - ${issue.score.toFixed(2)} - Content similarity match`
    ).join('\n');
  }

  /**
   * Process AI recommendations into structured format
   */
  private processAIRecommendations(
    aiResponse: string, 
    existingIssues: Array<{ id: string; title: string; description?: string }>,
    maxRecommendations: number
  ): IssueRecommendation[] {
    try {
      const recommendations: IssueRecommendation[] = [];
      const lines = aiResponse.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (recommendations.length >= maxRecommendations) break;

        // Parse AI response format: "Recommended Issue X: [Title] - [Score] - [Explanation]"
        const match = line.match(/Recommended Issue \d+: (.+?) - ([\d.]+) - (.+)/);
        if (match) {
          const [, title, scoreStr, explanation] = match;
          const relevanceScore = parseFloat(scoreStr);

          // Find matching issue in existing issues
          const matchingIssue = existingIssues.find(issue => 
            issue.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(issue.title.toLowerCase())
          );

          if (matchingIssue && !isNaN(relevanceScore) && relevanceScore >= 0.6) {
            recommendations.push({
              issueId: matchingIssue.id,
              title: matchingIssue.title,
              description: matchingIssue.description,
              relevanceScore,
              explanation
            });
          }
        }
      }

      return recommendations;
    } catch (error) {
      logger.error('[IssueRecommendationService] Error processing AI recommendations', { error, aiResponse });
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
      relevanceScore: 0.8 - (index * 0.1), // Decreasing relevance for fallback
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
