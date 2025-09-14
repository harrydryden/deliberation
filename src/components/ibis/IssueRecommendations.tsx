import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Lightbulb, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { IssueRecommendationService, IssueRecommendation } from '@/services/domain/implementations/issue-recommendation.service';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { createLogger } from '@/utils/logger';
import { RecommendationSkeleton } from './RecommendationSkeleton';

const logger = createLogger('IssueRecommendations');
import { CONFIDENCE_LEVELS, RELATIONSHIP_TYPE_OPTIONS } from '@/constants/ibisTypes';

// Request cache for deduplication
const requestCache = new Map<string, Promise<IssueRecommendation[]>>();
const CACHE_TTL = 30000; // 30 seconds

interface IssueRecommendationsProps {
  deliberationId: string;
  userContent: string;
  onIssueSelected?: (issueId: string) => void;
  onRelationshipsChange?: (relationships: Array<{id: string, type: string, confidence: number}>) => void;
  onReset?: () => void;
  className?: string;
}

export const IssueRecommendations: React.FC<IssueRecommendationsProps> = ({
  deliberationId,
  userContent,
  onIssueSelected,
  onRelationshipsChange,
  onReset,
  className = ''
}) => {
  const { user } = useSupabaseAuth();
  const [recommendations, setRecommendations] = useState<IssueRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [issueRelationshipTypes, setIssueRelationshipTypes] = useState<Map<string, string>>(new Map());

  // Use singleton service instance for better performance
  const [recommendationService] = useState(() => new IssueRecommendationService());

  // Reset state when modal key changes (component re-mounts)
  useEffect(() => {
    logger.debug('Component mounted/reset');
    setSelectedIssues(new Set());
    setIssueRelationshipTypes(new Map());
    setRecommendations([]);
    setError(null);
  }, []); // Only run on mount

  // Cache key for request deduplication
  const cacheKey = useMemo(() => 
    `${user?.id}-${deliberationId}-${userContent.trim()}`, 
    [user?.id, deliberationId, userContent]
  );

  // Fetch recommendations when content changes (with debouncing and caching)
  useEffect(() => {
    if (!user?.id || !userContent.trim()) {
      setRecommendations([]);
      setSelectedIssues(new Set());
      setIssueRelationshipTypes(new Map());
      return;
    }

    const fetchRecommendations = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check cache first for request deduplication
        let cachedPromise = requestCache.get(cacheKey);
        
        if (!cachedPromise) {
          cachedPromise = recommendationService.getIssueRecommendations({
            userId: user.id,
            deliberationId,
            content: userContent,
            maxRecommendations: 2
          });
          
          requestCache.set(cacheKey, cachedPromise);
          
          // Clear cache after TTL
          setTimeout(() => requestCache.delete(cacheKey), CACHE_TTL);
        }

        const results = await cachedPromise;
        setRecommendations(results);
        
        // Track usage for analytics (don't await to avoid blocking)
        recommendationService.trackRecommendationUsage(user.id, deliberationId, results)
          .catch(err => logger.warn('Analytics tracking failed', err));
      } catch (err) {
        logger.error('[IssueRecommendations] Error fetching recommendations', { error: err, deliberationId });
        setError('Failed to load issue recommendations');
        requestCache.delete(cacheKey); // Clear failed request from cache
      } finally {
        setIsLoading(false);
      }
    };

    // Optimized debounce with request deduplication
    const timeoutId = setTimeout(fetchRecommendations, 300); // Reduced for better responsiveness
    return () => clearTimeout(timeoutId);
  }, [cacheKey, user?.id, deliberationId, userContent, recommendationService]);

  // Handle issue selection with logging
  const handleIssueSelect = (issueId: string) => {
    logger.debug('Issue selection toggled', { issueId, wasSelected: selectedIssues.has(issueId) });
    
    const newSelected = new Set(selectedIssues);
    const newRelTypes = new Map(issueRelationshipTypes);
    
    if (newSelected.has(issueId)) {
      newSelected.delete(issueId);
      newRelTypes.delete(issueId);
    } else {
      newSelected.add(issueId);
      newRelTypes.set(issueId, 'supports'); // Default relationship type
    }
    
    setSelectedIssues(newSelected);
    setIssueRelationshipTypes(newRelTypes);

    // Notify parent component
    if (onIssueSelected) {
      onIssueSelected(issueId);
    }
  };

  // Handle relationship type change with logging
  const handleRelationshipTypeChange = (issueId: string, relationshipType: string) => {
    logger.debug('Relationship type changed', { issueId, relationshipType });
    
    const newRelTypes = new Map(issueRelationshipTypes);
    newRelTypes.set(issueId, relationshipType);
    setIssueRelationshipTypes(newRelTypes);
  };

  // Notify parent when relationships change with improved logic
  useEffect(() => {
    logger.debug('Relationships changed', { 
      selectedCount: selectedIssues.size, 
      relationshipTypesCount: issueRelationshipTypes.size 
    });
    
    if (onRelationshipsChange) {
      const relationships = Array.from(selectedIssues).map(issueId => ({
        id: issueId,
        type: issueRelationshipTypes.get(issueId) || 'supports',
        confidence: CONFIDENCE_LEVELS.AI_RECOMMENDATION
      }));
      
      logger.debug('Sending relationships to parent:', { count: relationships.length });
      onRelationshipsChange(relationships);
    }
  }, [selectedIssues, issueRelationshipTypes, onRelationshipsChange]);

  // Handle issue creation from recommendation
  const handleCreateFromRecommendation = async (recommendation: IssueRecommendation) => {
    try {
      // This would typically create a new IBIS node based on the recommendation
      // For now, we'll just log the action
      logger.info('[IssueRecommendations] Creating issue from recommendation', { recommendation });
      
      // Mark as selected
      setSelectedIssues(new Set([...selectedIssues, recommendation.issueId]));
      
      // Notify parent component
      if (onIssueSelected) {
        onIssueSelected(recommendation.issueId);
      }
    } catch (err) {
      logger.error('[IssueRecommendations] Error creating issue from recommendation', { error: err, recommendation });
      setError('Failed to create issue from recommendation');
    }
  };

  // Don't show if no content or no recommendations
  if (!userContent.trim() || (!isLoading && recommendations.length === 0)) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Issue Recommendations
        </CardTitle>
        <CardDescription>
          Suggested issues based on your submission
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <RecommendationSkeleton />
        )}

        {!isLoading && recommendations.length > 0 && (
            <div className="space-y-3">
              {selectedIssues.size > 0 && (
                <div className="p-2 bg-primary/10 rounded border border-primary/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-primary">Selected for Linking</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        logger.debug('Clearing all selections');
                        setSelectedIssues(new Set());
                        setIssueRelationshipTypes(new Map());
                      }}
                      className="h-5 text-xs text-muted-foreground hover:text-destructive"
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedIssues.size} issue{selectedIssues.size > 1 ? 's' : ''} selected for connection
                  </div>
                </div>
              )}
              
              {recommendations.map((recommendation) => (
              <div
                key={recommendation.issueId}
                className={`p-3 border rounded-lg transition-colors ${
                  selectedIssues.has(recommendation.issueId)
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-sm">{recommendation.title}</h4>
                      <Badge variant="outline" className="text-xs">
                        {recommendation.relevanceScore.toFixed(1)} relevance
                      </Badge>
                    </div>
                    
                    {recommendation.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {recommendation.description}
                      </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {recommendation.explanation}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant={selectedIssues.has(recommendation.issueId) ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleIssueSelect(recommendation.issueId)}
                      className="h-8 px-3"
                    >
                      {selectedIssues.has(recommendation.issueId) ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Selected
                        </>
                      ) : (
                        'Select'
                      )}
                    </Button>

                    {selectedIssues.has(recommendation.issueId) && (
                      <div className="mt-2">
                        <Label htmlFor={`relationship-type-${recommendation.issueId}`} className="text-xs">Relationship Type</Label>
                        <Select
                          value={issueRelationshipTypes.get(recommendation.issueId) || 'supports'}
                          onValueChange={(value) => handleRelationshipTypeChange(recommendation.issueId, value)}
                        >
                          <SelectTrigger id={`relationship-type-${recommendation.issueId}`} className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background border border-border shadow-lg z-50">
                            {RELATIONSHIP_TYPE_OPTIONS.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="text-xs text-muted-foreground text-center pt-2">
              {selectedIssues.size > 0 
                ? `${selectedIssues.size} issue${selectedIssues.size > 1 ? 's' : ''} selected for linking`
                : 'Select an issue to link your submission, or create a new one'
              }
            </div>
          </div>
        )}

        {!isLoading && recommendations.length === 0 && userContent.trim() && (
          <div className="text-center py-4">
            <p className="text-muted-foreground text-sm">
              No relevant issues found for your submission
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Consider creating a new issue or refining your submission
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
