import React, { useState, useEffect, memo, useMemo } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatingService, RatingSummary } from '@/services/domain/implementations/rating.service';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { logger } from '@/utils/logger';
import { cacheService } from '@/services/cache.service';

interface MessageRatingProps {
  messageId: string;
  messageType: string;
  className?: string;
}

const MessageRatingComponent: React.FC<MessageRatingProps> = ({
  messageId,
  messageType,
  className = ''
}) => {
  const { user } = useSupabaseAuth();
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize service instance to prevent recreating on every render
  const ratingService = useMemo(() => new RatingService(), []);

  // Fetch initial rating summary with caching
  useEffect(() => {
    if (!user?.id) return;

    const fetchRatingSummary = async () => {
      try {
        const summary = await cacheService.memoizeAsync(
          'rating-summary',
          [messageId, user.id],
          () => ratingService.getMessageRatingSummary(messageId, user.id),
          { ttl: 60000 } // Cache for 1 minute
        );
        setRatingSummary(summary);
      } catch (err) {
        logger.error('[MessageRating] Error fetching rating summary', { error: err, messageId });
        setError('Failed to load rating data');
      }
    };

    fetchRatingSummary();
  }, [messageId, user?.id, ratingService]);

  // Handle rating submission
  const handleRating = async (rating: -1 | 1) => {
    if (!user?.id) {
      setError('You must be logged in to rate messages');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // If user clicks the same rating again, remove it (set to neutral)
      if (ratingSummary?.userRating === rating) {
        await ratingService.removeRating(messageId, user.id);
      } else {
        await ratingService.rateMessage(messageId, user.id, rating);
      }
      
      // Clear cache and refresh the rating summary
      cacheService.clearNamespace('rating-summary');
      const summary = await ratingService.getMessageRatingSummary(messageId, user.id);
      setRatingSummary(summary);
    } catch (err) {
      logger.error('[MessageRating] Error submitting rating', { error: err, messageId, rating });
      setError('Failed to submit rating');
    } finally {
      setIsLoading(false);
    }
  };

  // Only show for agent messages
  if (!messageType || messageType === 'user') {
    return null;
  }

  if (error) {
    return (
      <div className={`text-sm text-destructive ${className}`}>
        {error}
      </div>
    );
  }

  if (!ratingSummary) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-8 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const userRating = ratingSummary.userRating;
  const totalRatings = ratingSummary.totalRatings;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Rating Buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant={userRating === 1 ? "default" : "outline"}
          size="sm"
          onClick={() => handleRating(1)}
          disabled={isLoading}
          className={`h-8 w-8 p-0 ${userRating === 1 ? 'bg-green-600 hover:bg-green-700' : ''}`}
          title={userRating === 1 ? "Click again to remove rating" : "Mark as helpful"}
        >
          <ThumbsUp className={`h-4 w-4 ${userRating === 1 ? 'text-white' : ''}`} />
        </Button>
        
        <Button
          variant={userRating === -1 ? "default" : "outline"}
          size="sm"
          onClick={() => handleRating(-1)}
          disabled={isLoading}
          className={`h-8 w-8 p-0 ${userRating === -1 ? 'bg-red-600 hover:bg-red-700' : ''}`}
          title={userRating === -1 ? "Click again to remove rating" : "Mark as unhelpful"}
        >
          <ThumbsDown className={`h-4 w-4 ${userRating === -1 ? 'text-white' : ''}`} />
        </Button>
      </div>

      {/* Rating Summary */}
      {totalRatings > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3 text-green-500" />
            {ratingSummary.helpfulCount}
          </span>
          <span className="flex items-center gap-1">
            <ThumbsDown className="h-3 w-3 text-red-500" />
            {ratingSummary.unhelpfulCount}
          </span>
        </div>
      )}

      {/* User's Current Rating Indicator */}
      {userRating === 0 ? (
        <div className="text-xs text-muted-foreground">
          Click thumbs up/down to rate this response
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {userRating === 1 ? 'You marked this as helpful' : 'You marked this as unhelpful'}
        </div>
      )}
    </div>
  );
};

export const MessageRating = memo(MessageRatingComponent, (prev, next) => 
  prev.messageId === next.messageId && 
  prev.messageType === next.messageType && 
  prev.className === next.className
);
