import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, 
  Share2, 
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

      setMetrics({
        totalMessages: userMessages.length,
        ibisSubmissions,
        participatingDeliberations: participations?.length || 0,
        joinDate: profile?.created_at || ''
      });

      logger.info('[UserMetricsDashboard] Metrics loaded successfully', {
        totalMessages: userMessages.length,
        ibisSubmissions,
        participatingDeliberations: participations?.length || 0
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {/* Detailed Engagement Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Engagement Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{metrics.participatingDeliberations}</div>
              <span className="text-sm text-muted-foreground">Active Deliberations</span>
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
    </div>
  );
};