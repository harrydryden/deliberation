import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ThumbsUp, ThumbsDown, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { StanceService, StanceScore } from '@/services/domain/implementations/stance.service';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

interface StanceScoreEditorProps {
  deliberationId: string;
  className?: string;
}

export const StanceScoreEditor: React.FC<StanceScoreEditorProps> = ({
  deliberationId,
  className = ''
}) => {
  const { user } = useSupabaseAuth();
  const [stanceScore, setStanceScore] = useState<StanceScore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const stanceService = new StanceService();
  const isCompact = className.includes('compact');

  // Fetch current stance score
  useEffect(() => {
    if (!user?.id) return;

    const fetchStanceScore = async () => {
      try {
        const score = await stanceService.getUserStanceScore(user.id, deliberationId);
        setStanceScore(score);
      } catch (err) {
        logger.error('[StanceScoreEditor] Error fetching stance score', { error: err, deliberationId });
        setError('Failed to load stance score');
      }
    };

    fetchStanceScore();
  }, [user?.id, deliberationId]);

  // Handle stance score update
  const handleStanceUpdate = async (newStanceScore: number, newConfidenceScore: number) => {
    if (!user?.id) {
      setError('You must be logged in to update stance scores');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedScore = await stanceService.updateStanceScore(
        user.id,
        deliberationId,
        newStanceScore,
        newConfidenceScore
      );

      setStanceScore(updatedScore);
      setIsEditing(false);
      setSuccess('Stance score updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      logger.error('[StanceScoreEditor] Error updating stance score', { error: err, deliberationId });
      setError('Failed to update stance score');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle automatic stance calculation
  const handleAutoCalculate = async () => {
    if (!user?.id) {
      setError('You must be logged in to calculate stance scores');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Analyze the user's messages in the deliberation using AI
      const { stanceScore: calculatedStance, confidenceScore: calculatedConfidence, semanticAnalysis } = 
        await stanceService.calculateStanceFromSemantic(user.id, deliberationId, '');

      // Update the stance score with the AI analysis
      const updatedScore = await stanceService.updateStanceScore(
        user.id,
        deliberationId,
        calculatedStance,
        calculatedConfidence,
        semanticAnalysis
      );

      setStanceScore(updatedScore);
      
      // Show success message with analysis details
      const messageCount = typeof semanticAnalysis?.messageCount === 'number' ? semanticAnalysis.messageCount : 0;
      setSuccess(
        messageCount > 0 
          ? `Stance recalculated based on ${messageCount} messages` 
          : 'Stance calculated (no messages found - using neutral stance)'
      );
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      logger.error('[StanceScoreEditor] Error calculating stance automatically', { error: err, deliberationId });
      setError('Failed to calculate stance automatically. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get stance score display information
  const getStanceDisplay = (score: number) => {
    if (score > 0.3) return { label: 'Positive', icon: ThumbsUp, color: 'text-green-600', bgColor: 'bg-green-100' };
    if (score < -0.3) return { label: 'Negative', icon: ThumbsDown, color: 'text-red-600', bgColor: 'bg-red-100' };
    return { label: 'Neutral', icon: Minus, color: 'text-gray-600', bgColor: 'bg-gray-100' };
  };

  // Get confidence display information
  const getConfidenceDisplay = (score: number) => {
    if (score > 0.7) return { label: 'High', color: 'text-green-600' };
    if (score > 0.4) return { label: 'Medium', color: 'text-yellow-600' };
    return { label: 'Low', color: 'text-red-600' };
  };

  if (!user?.id) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Please log in to view stance scores</p>
        </CardContent>
      </Card>
    );
  }

  if (isCompact) {
    return (
      <div className={cn("space-y-2", className)}>
        {/* Compact Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="font-medium text-sm">Stance Score</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-6 w-6 p-0"
          >
            {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </Button>
        </div>

        {!isCollapsed && (
          <>
            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="py-2">
                <AlertDescription className="text-xs">{success}</AlertDescription>
              </Alert>
            )}

            {stanceScore ? (
              <div className="space-y-2">
                {/* Compact Display */}
                <div className="flex items-center justify-between text-xs">
                  <span>Stance:</span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs h-5 ${getStanceDisplay(stanceScore.stanceScore).bgColor} ${getStanceDisplay(stanceScore.stanceScore).color}`}
                  >
                    {(() => {
                      const stanceDisplay = getStanceDisplay(stanceScore.stanceScore);
                      const IconComponent = stanceDisplay.icon;
                      return <IconComponent className="h-2 w-2 mr-1" />;
                    })()}
                    {getStanceDisplay(stanceScore.stanceScore).label}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span>Confidence:</span>
                  <Badge variant="outline" className={`text-xs h-5 ${getConfidenceDisplay(stanceScore.confidenceScore).color}`}>
                    {getConfidenceDisplay(stanceScore.confidenceScore).label}
                  </Badge>
                </div>

                {/* Compact Action Buttons */}
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    disabled={isLoading}
                    className="text-xs h-6 px-2"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoCalculate}
                    disabled={isLoading}
                    className="text-xs h-6 px-2"
                  >
                    {isLoading ? 'Analyzing...' : 'Recalculate'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-muted-foreground text-xs mb-2">No stance score yet</p>
                <Button 
                  onClick={handleAutoCalculate} 
                  disabled={isLoading}
                  size="sm"
                  className="text-xs h-6 px-2"
                >
                  {isLoading ? 'Calculating...' : 'Calculate Stance'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Current Stance Score Display */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Your Stance Score
          </CardTitle>
          <CardDescription>
            Your current position on this deliberation topic
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {stanceScore ? (
            <div className="space-y-4">
              {/* Stance Score Display */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Stance:</span>
                <Badge 
                  variant="outline" 
                  className={`${getStanceDisplay(stanceScore.stanceScore).bgColor} ${getStanceDisplay(stanceScore.stanceScore).color}`}
                >
                  {(() => {
                    const stanceDisplay = getStanceDisplay(stanceScore.stanceScore);
                    const IconComponent = stanceDisplay.icon;
                    return <IconComponent className="h-3 w-3 mr-1" />;
                  })()}
                  {getStanceDisplay(stanceScore.stanceScore).label}
                </Badge>
              </div>

              {/* Confidence Score Display */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Confidence:</span>
                <Badge variant="outline" className={getConfidenceDisplay(stanceScore.confidenceScore).color}>
                  {getConfidenceDisplay(stanceScore.confidenceScore).label}
                </Badge>
              </div>

              {/* Last Updated */}
              <div className="text-xs text-muted-foreground">
                Last updated: {new Date(stanceScore.lastUpdated).toLocaleDateString()}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  disabled={isLoading}
                >
                  Edit Manually
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoCalculate}
                  disabled={isLoading}
                >
                  {isLoading ? 'Analyzing Messages...' : 'Recalculate Automatically'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">No stance score recorded yet</p>
              <Button onClick={handleAutoCalculate} disabled={isLoading}>
                {isLoading ? 'Calculating...' : 'Calculate Initial Stance'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Stance Score Editor */}
      {isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Stance Score</CardTitle>
            <CardDescription>
              Adjust your stance and confidence levels manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stance Score Slider */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Stance Score</label>
              <div className="px-2">
                <Slider
                  value={[stanceScore?.stanceScore || 0]}
                  onValueChange={([value]) => {
                    if (stanceScore) {
                      setStanceScore({ ...stanceScore, stanceScore: value });
                    }
                  }}
                  min={-1}
                  max={1}
                  step={0.1}
                  className="w-full"
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Negative (-1.0)</span>
                <span>Neutral (0.0)</span>
                <span>Positive (1.0)</span>
              </div>
              <div className="text-center font-medium">
                Current: {stanceScore?.stanceScore?.toFixed(1) || '0.0'}
              </div>
            </div>

            {/* Confidence Score Slider */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Confidence Score</label>
              <div className="px-2">
                <Slider
                  value={[stanceScore?.confidenceScore || 0.5]}
                  onValueChange={([value]) => {
                    if (stanceScore) {
                      setStanceScore({ ...stanceScore, confidenceScore: value });
                    }
                  }}
                  min={0}
                  max={1}
                  step={0.1}
                  className="w-full"
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uncertain (0.0)</span>
                <span>Confident (1.0)</span>
              </div>
              <div className="text-center font-medium">
                Current: {stanceScore?.confidenceScore?.toFixed(1) || '0.5'}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (stanceScore) {
                    handleStanceUpdate(stanceScore.stanceScore, stanceScore.confidenceScore);
                  }
                }}
                disabled={isLoading}
              >
                Save Changes
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};