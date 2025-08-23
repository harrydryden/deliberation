import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Brain, Zap, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';

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
            description: `Found ${data.relationships.length} potential relationship${data.relationships.length > 1 ? 's' : ''}`,
          });
        }
      }
    } catch (error: any) {
      console.error('Error evaluating relationships:', error);
      toast({
        title: "Analysis Failed", 
        description: "Could not analyze relationships with existing content",
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
    } else {
      newSelected.add(key);
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
        <Label className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Smart Connections
        </Label>
        <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg border-l-4 border-l-muted">
          No meaningful relationships detected with existing contributions. Your contribution appears to be introducing new perspectives.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Smart Connections
          {suggestions.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {suggestions.length} found
            </Badge>
          )}
        </Label>
        
        {!evaluated && !loading && title.trim() && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={evaluateRelationships}
            className="flex items-center gap-1"
          >
            <Zap className="h-3 w-3" />
            Analyze
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <LoadingSpinner className="h-4 w-4" />
          <span className="text-sm text-muted-foreground">
            Analyzing relationships with existing contributions...
          </span>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-2 max-h-80 overflow-y-auto border rounded-lg p-2 bg-muted/20">
          {suggestions.map((suggestion, index) => {
            const key = `${suggestion.nodeId}-${suggestion.relationshipType}`;
            const isSelected = selectedRelationships.has(key);
            
            return (
              <Card 
                key={key} 
                className={`cursor-pointer transition-all hover:shadow-sm ${
                  isSelected ? 'ring-2 ring-primary shadow-sm' : ''
                }`}
                onClick={() => toggleRelationship(suggestion)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{getNodeTypeIcon(suggestion.nodeType)}</span>
                        <Badge variant="outline" className="capitalize text-xs">
                          {suggestion.nodeType}
                        </Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge className={`text-xs border ${getRelationshipColor(suggestion.relationshipType)}`}>
                          {formatRelationshipType(suggestion.relationshipType)}
                        </Badge>
                      </div>
                      
                      <div>
                        <h5 className="font-medium text-sm line-clamp-1">
                          {suggestion.nodeTitle}
                        </h5>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {suggestion.reasoning}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs">
                        <span className={`font-medium ${getConfidenceColor(suggestion.confidence)}`}>
                          {Math.round(suggestion.confidence * 100)}% confidence
                        </span>
                        <span className="text-muted-foreground">
                          {Math.round(suggestion.semanticSimilarity * 100)}% similarity
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0">
                      {isSelected ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {selectedRelationships.size > 0 && (
        <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
          {selectedRelationships.size} connection{selectedRelationships.size > 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
};