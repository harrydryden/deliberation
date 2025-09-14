import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { RELATIONSHIP_TYPE_OPTIONS } from '@/constants/ibisTypes';

interface SimilarNode {
  id: string;
  title: string;
  description?: string;
  nodeType: 'issue' | 'position' | 'argument';
  relationshipType: string;
  confidence: number;
  reasoning?: string;
  similarity: number;
  createdBy?: string;
}

interface SimilarIbisNodesProps {
  nodes: SimilarNode[];
  messageId: string;
  deliberationId?: string;
  onNodeSelect?: (node: SimilarNode) => void;
  selectedNodeIds?: string[];
  onRelationshipsChange?: (relationships: Array<{id: string, type: string, confidence: number}>) => void;
}

const SimilarIbisNodes: React.FC<SimilarIbisNodesProps> = ({ 
  nodes, 
  messageId, 
  deliberationId,
  onNodeSelect,
  selectedNodeIds = [],
  onRelationshipsChange
}) => {
  const { user } = useSupabaseAuth();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [selectedRelationships, setSelectedRelationships] = useState<Map<string, string>>(new Map());
  const { toast } = useToast();

  const handleNodeConnect = (nodeId: string, relationshipType: string) => {
    const newRelationships = new Map(selectedRelationships);
    
    if (newRelationships.has(nodeId)) {
      // If already selected, remove it
      newRelationships.delete(nodeId);
    } else {
      // Add new relationship
      newRelationships.set(nodeId, relationshipType);
    }
    
    setSelectedRelationships(newRelationships);
    
    // Notify parent component
    if (onRelationshipsChange) {
      const relationshipsArray = Array.from(newRelationships.entries()).map(([id, type]) => {
        const node = nodes.find(n => n.id === id);
        return {
          id,
          type,
          confidence: node?.confidence || 0.8
        };
      });
      onRelationshipsChange(relationshipsArray);
    }
  };

  const handleRelationshipTypeChange = (nodeId: string, relationshipType: string) => {
    const newRelationships = new Map(selectedRelationships);
    newRelationships.set(nodeId, relationshipType);
    setSelectedRelationships(newRelationships);
    
    // Notify parent component
    if (onRelationshipsChange) {
      const relationshipsArray = Array.from(newRelationships.entries()).map(([id, type]) => {
        const node = nodes.find(n => n.id === id);
        return {
          id,
          type,
          confidence: node?.confidence || 0.8
        };
      });
      onRelationshipsChange(relationshipsArray);
    }
  };

  const handleRate = async (nodeId: string, rating: 1 | -1) => {
    if (!deliberationId || !user?.id) return;
    
    setLoading(prev => ({ ...prev, [nodeId]: true }));
    
    try {
      const { error } = await supabase
        .from('ibis_node_ratings')
        .upsert({
          ibis_node_id: nodeId,
          message_id: messageId,
          user_id: user.id,
          rating,
          deliberation_id: deliberationId,
        }, {
          onConflict: 'ibis_node_id,message_id,user_id'
        });

      if (error) throw error;

      setRatings(prev => ({ ...prev, [nodeId]: rating }));
      
      toast({
        title: "Rating submitted",
        description: rating === 1 ? "Marked as helpful" : "Marked as unhelpful",
      });
    } catch (error) {
      logger.error('Error rating IBIS node', { nodeId, rating, error });
      toast({
        title: "Error",
        description: "Failed to submit rating",
        variant: "destructive",
      });
    } finally {
      setLoading(prev => ({ ...prev, [nodeId]: false }));
    }
  };

  const getNodeTypeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'issue': return '❓';
      case 'position': return '�';
      case 'argument': return '�';
      default: return '';
    }
  };

  const getRelationshipColor = (relationshipType?: string) => {
    const supportiveTypes = ['supports', 'strengthens', 'builds_on', 'addresses'];
    const oppositionalTypes = ['opposes', 'counters', 'contradicts', 'challenges'];
    const neutralTypes = ['relates_to', 'discusses', 'questions', 'refines'];

    const t = relationshipType || 'relates_to';
    if (supportiveTypes.some(type => t.includes(type))) {
      return 'bg-green-50 border-green-200 text-green-800';
    }
    if (oppositionalTypes.some(type => t.includes(type))) {
      return 'bg-red-50 border-red-200 text-red-800';
    }
    return 'bg-blue-50 border-blue-200 text-blue-800';
  };

  const formatRelationshipType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';  
    return 'text-red-600';
  };

  if (!nodes.length) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm font-medium text-muted-foreground">
        Related contributions from other participants:
      </div>
      
      {nodes.map((node) => {
        const isSelected = selectedRelationships.has(node.id);
        const selectedRelationType = selectedRelationships.get(node.id);
        
        return (
          <Card 
            key={node.id} 
            className={`border-l-4 transition-all hover:shadow-md ${
              isSelected 
                ? 'border-l-primary bg-primary/5 ring-2 ring-primary/20' 
                : 'border-l-primary/20 hover:border-l-primary/40'
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getNodeTypeIcon(node.nodeType)}</span>
                  <Badge variant="outline" className="capitalize">
                    {node.nodeType}
                  </Badge>
                  <Badge 
                    variant="secondary" 
                    className={`border ${getRelationshipColor(node.relationshipType)}`}
                  >
                    {formatRelationshipType(node.relationshipType)}
                  </Badge>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm">{node.title}</h4>
                  {node.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {node.description}
                    </p>
                  )}
                  {node.reasoning && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {node.reasoning}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-3 text-xs">
                  <span className={`font-medium ${getConfidenceColor(node.confidence)}`}>
                    {Math.round(node.confidence * 100)}% confidence
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round(node.similarity * 100)}% similarity
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNodeConnect(node.id, selectedRelationType || 'relates_to');
                  }}
                  className="h-8 px-3 flex items-center gap-1"
                >
                  {isSelected ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span className="text-xs">Connected</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      <span className="text-xs">Connect</span>
                    </>
                  )}
                </Button>
                
                {/* Relationship Type Selector - Show when connected */}
                {isSelected && (
                  <Select
                    value={selectedRelationType || 'relates_to'}
                    onValueChange={(value) => handleRelationshipTypeChange(node.id, value)}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-xs">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                <Button
                  type="button"
                  variant={ratings[node.id] === 1 ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRate(node.id, 1);
                  }}
                  disabled={loading[node.id]}
                  className="h-8 w-8 p-0"
                >
                  <ThumbsUp className="h-3 w-3" />
                </Button>
                
                <Button
                  type="button"
                  variant={ratings[node.id] === -1 ? "destructive" : "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRate(node.id, -1);
                  }}
                  disabled={loading[node.id]}
                  className="h-8 w-8 p-0"
                >
                  <ThumbsDown className="h-3 w-3" />
                </Button>
              </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default SimilarIbisNodes;