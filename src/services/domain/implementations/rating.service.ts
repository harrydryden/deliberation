import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface AgentRating {
  id: string;
  messageId: string;
  userId: string;
  rating: -1 | 1; // -1 for unhelpful, 1 for helpful
  createdAt: string;
  updatedAt: string;
}

export interface RatingSummary {
  helpfulCount: number;
  unhelpfulCount: number;
  totalRatings: number;
  userRating: -1 | 1 | 0; // 0 means no rating
}

export interface RatingStatistics {
  totalRatings: number;
  helpfulCount: number;
  unhelpfulCount: number;
  averageRating: number;
  satisfactionRate: number;
  ratingTrend: Array<{ date: string; count: number }>;
}

export class RatingService {
  /**
   * Rate a message (create or update rating)
   */
  async rateMessage(messageId: string, userId: string, rating: -1 | 1): Promise<AgentRating> {
    try {
      const { data, error } = await supabase
        .from('agent_ratings')
        .upsert(
          { message_id: messageId, user_id: userId, rating },
          { onConflict: 'message_id,user_id' }
        )
        .select()
        .single();

      if (error) {
        logger.error('[RatingService] Error rating message', { error, messageId, userId, rating });
        throw new Error(`Failed to rate message: ${error.message}`);
      }

      return {
        id: data.id,
        messageId: data.message_id,
        userId: data.user_id,
        rating: data.rating,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      logger.error('[RatingService] Unexpected error rating message', { error, messageId, userId, rating });
      throw error;
    }
  }

  /**
   * Remove a user's rating (set back to neutral)
   */
  async removeRating(messageId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('agent_ratings')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId);

      if (error) {
        logger.error('[RatingService] Error removing rating', { error, messageId, userId });
        throw new Error(`Failed to remove rating: ${error.message}`);
      }
    } catch (error) {
      logger.error('[RatingService] Unexpected error removing rating', { error, messageId, userId });
      throw error;
    }
  }

  /**
   * Get rating summary for a specific message
   */
  async getMessageRatingSummary(messageId: string, userId: string): Promise<RatingSummary> {
    try {
      const { data, error } = await supabase
        .rpc('get_message_rating_summary', { 
          message_uuid: messageId,
          user_uuid: userId 
        });

      if (error) {
        logger.error('[RatingService] Error getting rating summary', { error, messageId, userId });
        throw new Error(`Failed to get rating summary: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return {
          helpfulCount: 0,
          unhelpfulCount: 0,
          totalRatings: 0,
          userRating: 0,
        };
      }

      const summary = data[0];
      return {
        helpfulCount: Number(summary.helpful_count),
        unhelpfulCount: Number(summary.unhelpful_count),
        totalRatings: Number(summary.total_ratings),
        userRating: Number(summary.user_rating) as -1 | 1 | 0,
      };
    } catch (error) {
      logger.error('[RatingService] Unexpected error getting rating summary', { error, messageId, userId });
      throw error;
    }
  }

  /**
   * Get all ratings for admin view
   */
  async getAllRatings(): Promise<Array<AgentRating & { message: { content: string; message_type: string; deliberation_id: string } }>> {
    try {
      const { data, error } = await supabase
        .from('agent_ratings')
        .select(`
          *,
          message:messages(content, message_type, deliberation_id)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('[RatingService] Error getting all ratings', { error });
        throw new Error(`Failed to get all ratings: ${error.message}`);
      }

        return data.map(rating => ({
           id: rating.id,
           messageId: rating.message_id,
           userId: rating.user_id,
           rating: rating.rating,
           createdAt: rating.created_at,
           updatedAt: rating.updated_at,
           message: {
             content: rating.message?.content || '',
             message_type: rating.message?.message_type || '',
             deliberation_id: rating.message?.deliberation_id || '',
           },
         }));
    } catch (error) {
      logger.error('[RatingService] Unexpected error getting all ratings', { error });
      throw error;
    }
  }

  /**
   * Get rating statistics for admin dashboard
   */
  async getRatingStatistics(): Promise<RatingStatistics> {
    try {
      // Get overall counts
      const { data: counts, error: countsError } = await supabase
        .from('agent_ratings')
        .select('rating');

      if (countsError) {
        logger.error('[RatingService] Error getting rating counts', { error: countsError });
        throw new Error(`Failed to get rating counts: ${countsError.message}`);
      }

      const totalRatings = counts.length;
      const helpfulCount = counts.filter(r => r.rating === 1).length;
      const unhelpfulCount = counts.filter(r => r.rating === -1).length;
      const averageRating = totalRatings > 0 ? (helpfulCount - unhelpfulCount) / totalRatings : 0;
      const satisfactionRate = totalRatings > 0 ? (helpfulCount / totalRatings) * 100 : 0;

      // Get 30-day trend
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: trendData, error: trendError } = await supabase
        .from('agent_ratings')
        .select('created_at')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      if (trendError) {
        logger.error('[RatingService] Error getting rating trend', { error: trendError });
        // Continue without trend data rather than failing completely
      }

      const ratingTrend = trendData ? this.groupRatingsByDate(trendData) : [];

      return {
        totalRatings,
        helpfulCount,
        unhelpfulCount,
        averageRating,
        satisfactionRate,
        ratingTrend,
      };
    } catch (error) {
      logger.error('[RatingService] Unexpected error getting rating statistics', { error });
      throw error;
    }
  }

  /**
   * Group ratings by date for trend analysis
   */
  private groupRatingsByDate(ratings: Array<{ created_at: string }>): Array<{ date: string; count: number }> {
    const grouped = ratings.reduce((acc, rating) => {
      const date = new Date(rating.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([date, count]) => ({ date, count }));
  }
}
