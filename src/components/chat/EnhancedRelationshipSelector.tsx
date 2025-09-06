import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Brain, Zap, ArrowRight, CheckCircle2, XCircle, Lightbulb } from 'lucide-react';

interface RelationshipSuggestion {
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  relationshipType: string;
  confidence: number;
  reasoning: string;
  semanticSimilarity: number;
}

interface EnhancedRelationshipSelectorProps {
  deliberationId: string;
  content: string;
  title: string;
  nodeType: 'issue' | 'position' | 'argument';
  onRelationshipsChange: (relationships: Array<{id: string, type: string, confidence: number}>) => void;
}

export const EnhancedRelationshipSelector: React.FC<EnhancedRelationshipSelectorProps> = ({
  deliberationId,
  content,
  title,
  nodeType,
  onRelationshipsChange
}) => {
  const [suggestions, setSuggestions] = useState<RelationshipSuggestion[]>([]);
  const [selectedRelationships, setSelectedRelationships] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [evaluated, setEvaluated] = useState(false);
  const { toast } = useToast();

  // Maximum number of connections allowed
  const MAX_CONNECTIONS = 3;

  // Real-time evaluation trigger
  useEffect(() => {
    const evaluateTimer = setTimeout(() => {
      if (title.trim() && !evaluated) {
        evaluateRelationships();
      }
    }, 800); // Reduced debounce for faster response

    return () => clearTimeout(evaluateTimer);
  }, [title, content, nodeType, evaluated]);

  const evaluateRelationships = async () => {
    if (!title.trim() || loading) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-ibis-relationships', {
        body: {
          deliberationId,
          content: content || title,
          title,
          nodeType,
          includeAllTypes: true
        }
      });

      if (error) throw error;

      if (data?.success) {
        setSuggestions(data.relationships || []);
        setEvaluated(true);
        
        if (data.relationships?.length > 0) {
          toast({
            title: "Smart Connections Found",
            description: `Found ${data.relationships.length} potential relationship${data.relationships.length > 1 ? 's' : ''}. Select up to ${MAX_CONNECTIONS}.`,
          });
        }
      }
    } catch (error: any) {
      console.error('Error evaluating relationships:', error);
      toast({
        title: "Analysis Failed", 
        description: "Could not analyse relationships with existing content",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleRelationship = (suggestion: RelationshipSuggestion) => {
    const newSelected = new Set(selectedRelationships);
    const key = `${suggestion.nodeId}-${suggestion.relationshipType}`;
    
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else if (newSelected.size < MAX_CONNECTIONS) {
      newSelected.add(key);
    } else {
      toast({
        title: "Maximum Connections Reached",
        description: `You can only select up to ${MAX_CONNECTIONS} connections. Remove one to add another.`,
        variant: "destructive"
      });
      return;
    }
    
    setSelectedRelationships(newSelected);
    
    // Update parent component
    const relationships = suggestions
      .filter(s => newSelected.has(`${s.nodeId}-${s.relationshipType}`))
      .map(s => ({
        id: s.nodeId,
        type: s.relationshipType,
        confidence: s.confidence
      }));
    
    onRelationshipsChange(relationships);
  };

  const getRelationshipColor = (type: string) => {
    const supportiveTypes = ['supports', 'strengthens', 'builds_on', 'addresses'];
    const oppositionalTypes = ['opposes', 'counters', 'contradicts', 'challenges'];
    const neutralTypes = ['relates_to', 'discusses', 'questions', 'refines'];
    
    if (supportiveTypes.some(t => type.includes(t))) return 'bg-green-50 border-green-200 text-green-800';
    if (oppositionalTypes.some(t => type.includes(t))) return 'bg-red-50 border-red-200 text-red-800';
    return 'bg-blue-50 border-blue-200 text-blue-800';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatRelationshipType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getNodeTypeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'issue': return '❓';
      case 'position': return '💭';  
      case 'argument': return '📝';
      default: return '📄';
    }
  };

  if (!suggestions.length && !loading && evaluated) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          No AI relationship suggestions found. You can still create manual connections after submission.
        </div>
      </div>
    );
  }

  if (!suggestions.length && !loading && !evaluated) {
    return (
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Smart Connections
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={evaluateRelationships}
          className="flex items-center gap-2"
        >
          <Zap className="h-3 w-3" />
          Analyze Content
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Smart Connections ({suggestions.length} found)
        </Label>
        <div className="flex items-center gap-2">
          {selectedRelationships.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedRelationships.size}/{MAX_CONNECTIONS} selected
            </Badge>
          )}
          {selectedRelationships.size >= MAX_CONNECTIONS && (
            <Badge variant="outline" className="text-xs text-amber-600">
              Max reached
            </Badge>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <LoadingSpinner className="h-4 w-4" />
          <span className="text-sm text-muted-foreground">Analysing relationships...</span>
        </div>
      )}

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {suggestions.slice(0, 8).map((suggestion, index) => {
          const key = `${suggestion.nodeId}-${suggestion.relationshipType}`;
          const isSelected = selectedRelationships.has(key);
          const canSelect = selectedRelationships.size < MAX_CONNECTIONS || isSelected;
          
          return (
            <Card
              key={key}
              className={`cursor-pointer transition-all hover:shadow-sm ${
                isSelected 
                  ? 'ring-2 ring-primary bg-primary/5' 
                  : canSelect 
                    ? 'hover:border-primary/50'
                    : 'opacity-60 cursor-not-allowed hover:border-border'
              }`}
              onClick={() => canSelect && toggleRelationship(suggestion)}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {isSelected ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : canSelect ? (
                      <div className="h-4 w-4 rounded-full border-2 border-border hover:border-primary transition-colors" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{getNodeTypeIcon(suggestion.nodeType)}</span>
                      <span className="font-medium text-sm truncate">
                        {suggestion.nodeTitle}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getRelationshipColor(suggestion.relationshipType)}`}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        {formatRelationshipType(suggestion.relationshipType)}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}>
                        {Math.round(suggestion.confidence * 100)}% confidence
                      </Badge>
                    </div>
                    
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {suggestion.reasoning}
                    </p>
                    
                    {suggestion.semanticSimilarity && (
                      <div className="mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(suggestion.semanticSimilarity * 100)}% similarity
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {suggestions.length === 0 && evaluated && !loading && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No meaningful relationships detected with existing content.
        </div>
      )}

      {selectedRelationships.size > 0 && (
        <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <h6 className="text-sm font-medium mb-2">Selected Connections ({selectedRelationships.size}/{MAX_CONNECTIONS})</h6>
          <div className="space-y-1 text-xs text-muted-foreground">
            {suggestions
              .filter(s => selectedRelationships.has(`${s.nodeId}-${s.relationshipType}`))
              .map(s => (
                <div key={`${s.nodeId}-${s.relationshipType}`} className="flex items-center gap-2">
                  <span>{getNodeTypeIcon(s.nodeType)}</span>
                  <span className="font-medium">{s.nodeTitle.slice(0, 30)}...</span>
                  <ArrowRight className="h-3 w-3 text-primary" />
                  <span className="text-primary">{formatRelationshipType(s.relationshipType)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};