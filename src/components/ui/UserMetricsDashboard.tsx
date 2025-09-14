import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  MessageSquare, 
  Share2, 
  RefreshCw,
  User,
  Calendar,
  BarChart3,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { logger } from '@/utils/logger';
import { RatingService } from '@/services/domain/implementations/rating.service';

interface DeliberationMetrics {
  totalMessages: number;
  ibisSubmissions: number;
  contributionRate: number;
  ratings: RatingMetrics;
}

interface RatingMetrics {
  helpfulRatings: number;
  unhelpfulRatings: number;
  totalRatings: number;
}

interface UserMetrics {
  allDeliberations: DeliberationMetrics;
  currentDeliberation: DeliberationMetrics | null;
  participatingDeliberations: Array<{ id: string; title: string }>;
  joinDate: string;
}

export const UserMetricsDashboard: React.FC = () => {
  const { user } = useSupabaseAuth();
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [selectedDeliberationId, setSelectedDeliberationId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingService] = useState(() => new RatingService());

  const fetchUserMetrics = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get user's messages
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, deliberation_id, submitted_to_ibis, created_at')
        .eq('user_id', user.id);

      if (messagesError) throw messagesError;

      // Get user's participations with deliberation titles
      const { data: participations, error: participationsError } = await supabase
        .from('participants')
        .select(`
          deliberation_id,
          deliberations!inner(id, title)
        `)
        .eq('user_id', user.id);

      if (participationsError) throw participationsError;

      // Get user profile for join date
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      // Calculate metrics
      const userMessages = messages || [];
      const userParticipations = participations || [];

      // Get user ratings
      const { data: userRatings, error: ratingsError } = await supabase
        .from('agent_ratings')
        .select('rating')
        .eq('user_id', user.id);

      if (ratingsError) throw ratingsError;

      // Calculate rating metrics
      const ratings = userRatings || [];
      const helpfulRatings = ratings.filter(r => r.rating === 1).length;
      const unhelpfulRatings = ratings.filter(r => r.rating === -1).length;

      // All deliberations metrics
      const allIbisSubmissions = userMessages.filter(m => m.submitted_to_ibis).length;
      const allContributionRate = userMessages.length > 0 ? (allIbisSubmissions / userMessages.length) * 100 : 0;

      // Current deliberation metrics (if selected)
      let currentDeliberationMetrics: DeliberationMetrics | null = null;
      if (selectedDeliberationId) {
        const currentMessages = userMessages.filter(m => m.deliberation_id === selectedDeliberationId);
        const currentIbisSubmissions = currentMessages.filter(m => m.submitted_to_ibis).length;
        const currentContributionRate = currentMessages.length > 0 ? (currentIbisSubmissions / currentMessages.length) * 100 : 0;
        
        // Get ratings for messages in current deliberation
        const { data: currentDeliberationRatings, error: currentRatingsError } = await supabase
          .from('agent_ratings')
          .select('rating')
          .eq('user_id', user.id)
          .in('message_id', currentMessages.map(m => m.id));

        const currentHelpfulRatings = (currentDeliberationRatings || []).filter(r => r.rating === 1).length;
        const currentUnhelpfulRatings = (currentDeliberationRatings || []).filter(r => r.rating === -1).length;
        
        currentDeliberationMetrics = {
          totalMessages: currentMessages.length,
          ibisSubmissions: currentIbisSubmissions,
          contributionRate: currentContributionRate,
          ratings: {
            helpfulRatings: currentHelpfulRatings,
            unhelpfulRatings: currentUnhelpfulRatings,
            totalRatings: currentHelpfulRatings + currentUnhelpfulRatings
          }
        };
      }

      // Prepare deliberation list
      const deliberationList = userParticipations.map(p => ({
        id: p.deliberation_id || '',
        title: (p.deliberations as any)?.title || 'Unknown Deliberation'
      }));

      setMetrics({
        allDeliberations: {
          totalMessages: userMessages.length,
          ibisSubmissions: allIbisSubmissions,
          contributionRate: allContributionRate,
          ratings: {
            helpfulRatings,
            unhelpfulRatings,
            totalRatings: helpfulRatings + unhelpfulRatings
          }
        },
        currentDeliberation: currentDeliberationMetrics,
        participatingDeliberations: deliberationList,
        joinDate: profile?.created_at || ''
      });

      // Auto-select first deliberation if none selected and deliberations exist
      if (!selectedDeliberationId && deliberationList.length > 0) {
        setSelectedDeliberationId(deliberationList[0].id);
      }

      logger.info('[UserMetricsDashboard] Metrics loaded successfully', {
        totalMessages: userMessages.length,
        allIbisSubmissions,
        participatingDeliberations: deliberationList.length
      });

    } catch (err) {
      logger.error('[UserMetricsDashboard] Error loading metrics', { error: err });
      setError('Failed to load your metrics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchUserMetrics();
    }
  }, [user?.id, selectedDeliberationId]);

  if (!user) return null;

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
            <Button onClick={fetchUserMetrics} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No metrics available</p>
        </CardContent>
      </Card>
    );
  }

  const renderMetricsCards = (metricsData: DeliberationMetrics, title: string) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData.totalMessages}</div>
            <span className="text-xs text-muted-foreground">
              Total messages in {title.toLowerCase()}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">IBIS Contributions</CardTitle>
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData.ibisSubmissions}</div>
            <span className="text-xs text-muted-foreground">
              Messages shared to knowledge map
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contribution Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData.contributionRate.toFixed(0)}%</div>
            <span className="text-xs text-muted-foreground">
              Messages shared to IBIS
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Ratings Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Helpful Ratings</CardTitle>
            <ThumbsUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metricsData.ratings.helpfulRatings}</div>
            <span className="text-xs text-muted-foreground">
              Positive ratings given
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unhelpful Ratings</CardTitle>
            <ThumbsDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metricsData.ratings.unhelpfulRatings}</div>
            <span className="text-xs text-muted-foreground">
              Negative ratings given
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ratings</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData.ratings.totalRatings}</div>
            <span className="text-xs text-muted-foreground">
              Agent responses rated
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Your Participation Metrics</h2>
          <p className="text-muted-foreground">Track your engagement and contributions</p>
        </div>
        <Button onClick={fetchUserMetrics} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Deliberation Selector */}
      {metrics && metrics.participatingDeliberations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Current Deliberation</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedDeliberationId} onValueChange={setSelectedDeliberationId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a deliberation to view detailed metrics" />
              </SelectTrigger>
              <SelectContent>
                {metrics.participatingDeliberations.map((deliberation) => (
                  <SelectItem key={deliberation.id} value={deliberation.id}>
                    {deliberation.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Metrics Tabs */}
      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="current">Current Deliberation</TabsTrigger>
          <TabsTrigger value="all">All Deliberations</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-4">
          {metrics?.currentDeliberation ? (
            <>
              <h3 className="text-lg font-semibold">Current Deliberation Metrics</h3>
              {renderMetricsCards(metrics.currentDeliberation, "Current Deliberation")}
            </>
          ) : (
            <Card>
              <CardContent className="p-6">
                <p className="text-center text-muted-foreground">
                  {selectedDeliberationId ? 'No data available for selected deliberation' : 'Select a deliberation to view detailed metrics'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <h3 className="text-lg font-semibold">All Deliberations Summary</h3>
          {renderMetricsCards(metrics?.allDeliberations || { 
            totalMessages: 0, 
            ibisSubmissions: 0, 
            contributionRate: 0, 
            ratings: { helpfulRatings: 0, unhelpfulRatings: 0, totalRatings: 0 }
          }, "All Deliberations")}
          
          {/* Additional Summary Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Overall Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{metrics?.participatingDeliberations.length || 0}</div>
                  <span className="text-sm text-muted-foreground">Total Deliberations</span>
                </div>

                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {metrics?.joinDate ? new Date(metrics.joinDate).toLocaleDateString() : 'Unknown'}
                  </div>
                  <span className="text-sm text-muted-foreground">Member Since</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};