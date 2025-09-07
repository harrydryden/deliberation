import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThumbsUp, ThumbsDown, TrendingUp, BarChart3, MessageSquare, RefreshCw } from 'lucide-react';
import { RatingService, AgentRating, RatingStatistics } from '@/services/domain/implementations/rating.service';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { logger } from '@/utils/logger';

export const AgentRatingDashboard: React.FC = () => {
  const [statistics, setStatistics] = useState<RatingStatistics | null>(null);
  const [ratings, setRatings] = useState<Array<AgentRating & { message: { content: string; message_type: string; deliberation_id: string } }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ratingService = new RatingService();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [stats, allRatings] = await Promise.all([
        ratingService.getRatingStatistics(),
        ratingService.getAllRatings()
      ]);

      setStatistics(stats);
      setRatings(allRatings);
    } catch (err) {
      logger.error('[AgentRatingDashboard] Error fetching data', { error: err });
      setError('Failed to load rating data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!statistics) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No rating data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ratings</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.totalRatings}</div>
            <p className="text-xs text-muted-foreground">
              All time ratings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Helpful</CardTitle>
            <ThumbsUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{statistics.helpfulCount}</div>
            <p className="text-xs text-muted-foreground">
              {statistics.totalRatings > 0 ? `${((statistics.helpfulCount / statistics.totalRatings) * 100).toFixed(1)}%` : '0%'} of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unhelpful</CardTitle>
            <ThumbsDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{statistics.unhelpfulCount}</div>
            <p className="text-xs text-muted-foreground">
              {statistics.totalRatings > 0 ? `${((statistics.unhelpfulCount / statistics.totalRatings) * 100).toFixed(1)}%` : '0%'} of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Satisfaction Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{statistics.satisfactionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Helpful ratings percentage
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rating Trend Chart */}
      {statistics.ratingTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Rating Trend (Last 30 Days)
            </CardTitle>
            <CardDescription>
              Daily rating activity showing engagement patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-end gap-1">
              {statistics.ratingTrend.map((day, index) => (
                <div
                  key={day.date}
                  className="flex-1 bg-blue-100 dark:bg-blue-900 rounded-t"
                  style={{
                    height: `${Math.max((day.count / Math.max(...statistics.ratingTrend.map(d => d.count))) * 100, 10)}%`
                  }}
                  title={`${day.date}: ${day.count} ratings`}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{statistics.ratingTrend[0]?.date}</span>
              <span>{statistics.ratingTrend[statistics.ratingTrend.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual Ratings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Ratings</span>
            <Button onClick={fetchData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Individual message ratings with context
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All ({ratings.length})</TabsTrigger>
              <TabsTrigger value="helpful">Helpful ({statistics.helpfulCount})</TabsTrigger>
              <TabsTrigger value="unhelpful">Unhelpful ({statistics.unhelpfulCount})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {ratings.map((rating) => (
                <RatingItem key={rating.id} rating={rating} />
              ))}
            </TabsContent>

            <TabsContent value="helpful" className="space-y-4">
              {ratings.filter(r => r.rating === 1).map((rating) => (
                <RatingItem key={rating.id} rating={rating} />
              ))}
            </TabsContent>

            <TabsContent value="unhelpful" className="space-y-4">
              {ratings.filter(r => r.rating === -1).map((rating) => (
                <RatingItem key={rating.id} rating={rating} />
              ))}
            </TabsContent>
          </Tabs>

          {ratings.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No ratings found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

interface RatingItemProps {
  rating: AgentRating & { message: { content: string; message_type: string; deliberation_id: string } };
}

const RatingItem: React.FC<RatingItemProps> = ({ rating }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={rating.rating === 1 ? "default" : "destructive"}>
            {rating.rating === 1 ? (
              <>
                <ThumbsUp className="h-3 w-3 mr-1" />
                Helpful
              </>
            ) : (
              <>
                <ThumbsDown className="h-3 w-3 mr-1" />
                Unhelpful
              </>
            )}
          </Badge>
          <Badge variant="outline">{rating.message.message_type}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(rating.createdAt)}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Message Content:</p>
        <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
          {truncateContent(rating.message.content)}
        </p>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>User ID: {rating.userId.substring(0, 8)}...</span>
        <span>Deliberation: {rating.message.deliberation_id.substring(0, 8)}...</span>
      </div>
    </div>
  );
};
