import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Minus, BarChart3, Users, RefreshCw } from 'lucide-react';
import { StanceService, StanceSummary } from '@/services/domain/implementations/stance.service';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { logger } from '@/utils/logger';

interface UserStanceScoreChartProps {
  deliberationId: string;
  className?: string;
}

export const UserStanceScoreChart: React.FC<UserStanceScoreChartProps> = ({
  deliberationId,
  className = ''
}) => {
  const [stanceSummary, setStanceSummary] = useState<StanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stanceService = new StanceService();

  const fetchStanceSummary = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const summary = await stanceService.getDeliberationStanceSummary(deliberationId);
      setStanceSummary(summary);
    } catch (err) {
      logger.error('[UserStanceScoreChart] Error fetching stance summary', { error: err, deliberationId });
      setError('Failed to load stance summary');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStanceSummary();
  }, [deliberationId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchStanceSummary} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stanceSummary || stanceSummary.totalUsers === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No stance data available for this deliberation</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate percentages
  const positivePercentage = stanceSummary.totalUsers > 0 ? (stanceSummary.positiveUsers / stanceSummary.totalUsers) * 100 : 0;
  const negativePercentage = stanceSummary.totalUsers > 0 ? (stanceSummary.negativeUsers / stanceSummary.totalUsers) * 100 : 0;
  const neutralPercentage = stanceSummary.totalUsers > 0 ? (stanceSummary.neutralUsers / stanceSummary.totalUsers) * 100 : 0;

  // Get stance trend indicator
  const getStanceTrend = (averageStance: number) => {
    if (averageStance > 0.1) return { icon: TrendingUp, color: 'text-green-600', label: 'Positive Trend' };
    if (averageStance < -0.1) return { icon: TrendingDown, color: 'text-red-600', label: 'Negative Trend' };
    return { icon: Minus, color: 'text-gray-600', label: 'Neutral Trend' };
  };

  const trendInfo = getStanceTrend(stanceSummary.averageStance);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overview Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stanceSummary.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              Users with stance scores
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Stance</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stanceSummary.averageStance.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Overall sentiment (-1.0 to 1.0)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trend</CardTitle>
            <trendInfo.icon className={`h-4 w-4 ${trendInfo.color}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${trendInfo.color}`}>
              {trendInfo.label}
            </div>
            <p className="text-xs text-muted-foreground">
              Current sentiment direction
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stanceSummary.averageConfidence.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              User confidence in stance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Stance Distribution</span>
            <Button onClick={fetchStanceSummary} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Breakdown of user stance positions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="chart">Chart</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Positive Users */}
                <div className="text-center p-4 border rounded-lg bg-green-50 dark:bg-green-950">
                  <div className="text-3xl font-bold text-green-600 mb-2">
                    {stanceSummary.positiveUsers}
                  </div>
                  <div className="text-sm font-medium text-green-700 dark:text-green-300">
                    Positive Stance
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {positivePercentage.toFixed(1)}% of users
                  </div>
                </div>

                {/* Neutral Users */}
                <div className="text-center p-4 border rounded-lg bg-gray-50 dark:bg-gray-950">
                  <div className="text-3xl font-bold text-gray-600 mb-2">
                    {stanceSummary.neutralUsers}
                  </div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Neutral Stance
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {neutralPercentage.toFixed(1)}% of users
                  </div>
                </div>

                {/* Negative Users */}
                <div className="text-center p-4 border rounded-lg bg-red-50 dark:bg-red-950">
                  <div className="text-3xl font-bold text-red-600 mb-2">
                    {stanceSummary.negativeUsers}
                  </div>
                  <div className="text-sm font-medium text-red-700 dark:text-red-300">
                    Negative Stance
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {negativePercentage.toFixed(1)}% of users
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="chart" className="space-y-4">
              <div className="space-y-4">
                {/* Positive Stance Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Positive Stance</span>
                    <span>{stanceSummary.positiveUsers} users ({positivePercentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                    <div 
                      className="bg-green-600 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${positivePercentage}%` }}
                    />
                  </div>
                </div>

                {/* Neutral Stance Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Neutral Stance</span>
                    <span>{stanceSummary.neutralUsers} users ({neutralPercentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                    <div 
                      className="bg-gray-600 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${neutralPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Negative Stance Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Negative Stance</span>
                    <span>{stanceSummary.negativeUsers} users ({negativePercentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                    <div 
                      className="bg-red-600 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${negativePercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Total Participants:</span>
                    <span className="ml-2">{stanceSummary.totalUsers}</span>
                  </div>
                  <div>
                    <span className="font-medium">Average Stance:</span>
                    <span className="ml-2">{stanceSummary.averageStance.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="font-medium">Positive Users:</span>
                    <span className="ml-2">{stanceSummary.positiveUsers} ({positivePercentage.toFixed(1)}%)</span>
                  </div>
                  <div>
                    <span className="font-medium">Negative Users:</span>
                    <span className="ml-2">{stanceSummary.negativeUsers} ({negativePercentage.toFixed(1)}%)</span>
                  </div>
                  <div>
                    <span className="font-medium">Neutral Users:</span>
                    <span className="ml-2">{stanceSummary.neutralUsers} ({neutralPercentage.toFixed(1)}%)</span>
                  </div>
                  <div>
                    <span className="font-medium">Average Confidence:</span>
                    <span className="ml-2">{stanceSummary.averageConfidence.toFixed(3)}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  <p>• Stance scores range from -1.0 (strongly negative) to 1.0 (strongly positive)</p>
                  <p>• Neutral stance includes scores from -0.1 to 0.1</p>
                  <p>• Confidence scores range from 0.0 (uncertain) to 1.0 (very confident)</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
