import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, 
  Share2, 
  ThumbsUp, 
  ThumbsDown, 
  TrendingUp, 
  RefreshCw,
  User,
  Calendar,
  BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { logger } from '@/utils/logger';

interface UserMetrics {
  totalMessages: number;
  ibisSubmissions: number;
  ratingsReceived: {
    helpful: number;
    unhelpful: number;
    total: number;
  };
  ratingsGiven: {
    helpful: number;
    unhelpful: number;
    total: number;
  };
  participatingDeliberations: number;
  joinDate: string;
}

export const UserMetricsDashboard: React.FC = () => {
  const { user } = useSupabaseAuth();
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      // Get ratings received on user's messages
      const { data: ratingsReceived, error: ratingsReceivedError } = await supabase
        .from('agent_ratings')
        .select('rating, message_id')
        .in('message_id', messages?.map(m => m.id) || []);

      if (ratingsReceivedError) throw ratingsReceivedError;

      // Get ratings given by user
      const { data: ratingsGiven, error: ratingsGivenError } = await supabase
        .from('agent_ratings')
        .select('rating')
        .eq('user_id', user.id);

      if (ratingsGivenError) throw ratingsGivenError;

      // Get user's participations
      const { data: participations, error: participationsError } = await supabase
        .from('participants')
        .select('deliberation_id')
        .eq('user_id', user.id);

      if (participationsError) throw participationsError;

      // Get user profile for join date
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      // Calculate metrics
      const userMessages = messages || [];
      const ibisSubmissions = userMessages.filter(m => m.submitted_to_ibis).length;
      const receivedRatings = ratingsReceived || [];
      const givenRatings = ratingsGiven || [];

      const helpfulReceived = receivedRatings.filter(r => r.rating === 1).length;
      const unhelpfulReceived = receivedRatings.filter(r => r.rating === -1).length;
      const helpfulGiven = givenRatings.filter(r => r.rating === 1).length;
      const unhelpfulGiven = givenRatings.filter(r => r.rating === -1).length;

      setMetrics({
        totalMessages: userMessages.length,
        ibisSubmissions,
        ratingsReceived: {
          helpful: helpfulReceived,
          unhelpful: unhelpfulReceived,
          total: receivedRatings.length
        },
        ratingsGiven: {
          helpful: helpfulGiven,
          unhelpful: unhelpfulGiven,
          total: givenRatings.length
        },
        participatingDeliberations: participations?.length || 0,
        joinDate: profile?.created_at || ''
      });

      logger.info('[UserMetricsDashboard] Metrics loaded successfully', {
        totalMessages: userMessages.length,
        ibisSubmissions,
        ratingsReceived: receivedRatings.length,
        ratingsGiven: givenRatings.length
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
  }, [user?.id]);

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

  const satisfactionRate = metrics.ratingsReceived.total > 0 
    ? (metrics.ratingsReceived.helpful / metrics.ratingsReceived.total) * 100 
    : 0;

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

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalMessages}</div>
            <span className="text-xs text-muted-foreground">
              Total messages across all deliberations
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">IBIS Contributions</CardTitle>
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.ibisSubmissions}</div>
            <span className="text-xs text-muted-foreground">
              Messages shared to knowledge map
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Satisfaction Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{satisfactionRate.toFixed(1)}%</div>
            <span className="text-xs text-muted-foreground">
              Of your messages rated as helpful
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deliberations</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.participatingDeliberations}</div>
            <span className="text-xs text-muted-foreground">
              Deliberations participated in
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <Tabs defaultValue="ratings" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ratings">Rating Activity</TabsTrigger>
          <TabsTrigger value="engagement">Engagement Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="ratings" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ratings Received */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Ratings Received
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Helpful</span>
                  </div>
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    {metrics.ratingsReceived.helpful}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">Unhelpful</span>
                  </div>
                  <Badge variant="destructive" className="bg-red-100 text-red-800">
                    {metrics.ratingsReceived.unhelpful}
                  </Badge>
                </div>

                <div className="pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    Total: {metrics.ratingsReceived.total} ratings on your messages
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Ratings Given */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Ratings Given
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Helpful</span>
                  </div>
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    {metrics.ratingsGiven.helpful}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">Unhelpful</span>
                  </div>
                  <Badge variant="destructive" className="bg-red-100 text-red-800">
                    {metrics.ratingsGiven.unhelpful}
                  </Badge>
                </div>

                <div className="pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    Total: {metrics.ratingsGiven.total} ratings you've given
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engagement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Engagement Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{metrics.totalMessages}</div>
                  <span className="text-sm text-muted-foreground">Total Messages</span>
                </div>
                
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {metrics.totalMessages > 0 ? ((metrics.ibisSubmissions / metrics.totalMessages) * 100).toFixed(0) : 0}%
                  </div>
                  <span className="text-sm text-muted-foreground">Contribution Rate</span>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Member since</span>
                  <span className="font-medium">
                    {metrics.joinDate ? new Date(metrics.joinDate).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};