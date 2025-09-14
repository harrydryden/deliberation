import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Brain, Zap, ArrowRight, CheckCircle2, XCircle, Lightbulb, Plus, Trash2 } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { RELATIONSHIP_TYPE_OPTIONS } from '@/constants/ibisTypes';

const logger = createLogger('EnhancedRelationshipSelector');

interface RelationshipSuggestion {
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  relationshipType: string;
  confidence: number;
  reasoning: string;
  semanticSimilarity: number | null;
}

interface SelectedSuggestion extends RelationshipSuggestion {
  selectedRelationshipType: string;
}

interface EnhancedRelationshipSelectorProps {
  deliberationId: string;
  content: string;
  title: string;
  nodeType: 'issue' | 'position' | 'argument';
  onRelationshipsChange: (relationships: Array<{id: string, type: string, confidence: number}>) => void;
  onReset?: () => void;
}

export const EnhancedRelationshipSelector: React.FC<EnhancedRelationshipSelectorProps> = ({
  deliberationId,
  content,
  title,
  nodeType,
  onRelationshipsChange,
  onReset
}) => {
  const [suggestions, setSuggestions] = useState<RelationshipSuggestion[]>([]);
  const [selectedRelationships, setSelectedRelationships] = useState<Set<string>>(new Set());
  const [suggestionRelationshipTypes, setSuggestionRelationshipTypes] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [evaluated, setEvaluated] = useState(false);
  const [existingNodes, setExistingNodes] = useState<Array<{id: string, title: string, node_type: string}>>([]);
  const [manualConnections, setManualConnections] = useState<Array<{nodeId: string, relationshipType: string}>>([]);
  const { toast } = useToast();

  // Maximum number of connections allowed
  const MAX_CONNECTIONS = 3;

  // Calculate total connections more reliably
  const totalConnections = selectedRelationships.size + manualConnections.filter(c => c.nodeId && c.relationshipType).length;

  // Reset state when component mounts (via key change)
  useEffect(() => {
    logger.debug('Component mounted/reset');
    setSelectedRelationships(new Set());
    setSuggestionRelationshipTypes(new Map());
    setManualConnections([]);
    setSuggestions([]);
    setEvaluated(false);
  }, []); // Only run on mount

  // Load existing nodes for manual connection
  useEffect(() => {
    const loadExistingNodes = async () => {
      const { data, error } = await supabase
        .from('ibis_nodes')
        .select('id, title, node_type')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setExistingNodes(data);
      }
    };
    
    loadExistingNodes();
  }, [deliberationId]);

  // Smart evaluation trigger - only evaluate when user stops typing
  useEffect(() => {
    // Don't auto-evaluate on component mount
    if (!title.trim()) {
      return;
    }

    const evaluateTimer = setTimeout(() => {
      // Only evaluate if user has provided meaningful input and hasn't evaluated yet
      if (title.trim().length > 3 && !evaluated) {
        logger.debug('Auto-triggering evaluation for:', { title });
        evaluateRelationships();
      }
    }, 1200); // Increased debounce to reduce aggressive calls

    return () => clearTimeout(evaluateTimer);
  }, [title, content, nodeType, evaluated]);

  const evaluateRelationships = async () => {
    if (!title.trim() || loading) return;
    
    logger.debug('Evaluating relationships for:', { title });
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('relationship_evaluator', {
        body: {
          deliberationId,
          content: content || title,
          title,
          nodeType,
          includeAllTypes: true
        }
      });

      if (error) throw error;

      // Accept relationships regardless of success flag - be resilient to edge function issues
      if (data?.relationships && Array.isArray(data.relationships)) {
        setSuggestions(data.relationships);
        setEvaluated(true);
        
        logger.debug('Found relationships:', { count: data.relationships.length, success: data.success });
        
        // Show suggestions but don't auto-select them
        if (data.relationships.length > 0) {
          toast({
            title: "Smart Connections Available",
            description: `Found ${data.relationships.length} potential relationship${data.relationships.length > 1 ? 's' : ''}. Review and select up to ${MAX_CONNECTIONS}.`,
          });
        } else if (data.success === false) {
          logger.debug('Relationship evaluation completed but found no suggestions');
        }
      } else if (data?.success === false) {
        // If explicitly failed, still mark as evaluated but don't show error to user
        setEvaluated(true);
        logger.debug('Relationship evaluation completed with no suggestions');
      }
    } catch (error: any) {
      logger.error('Error evaluating relationships', { deliberationId, content, title, nodeType, error });
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
    logger.debug('Toggling relationship', { 
      nodeId: suggestion.nodeId, 
      relationshipType: suggestion.relationshipType,
      wasSelected: selectedRelationships.has(`${suggestion.nodeId}-${suggestion.relationshipType}`)
    });
    
    const newSelected = new Set(selectedRelationships);
    const key = `${suggestion.nodeId}-${suggestion.relationshipType}`;
    
    if (newSelected.has(key)) {
      newSelected.delete(key);
      // Remove the custom relationship type when deselecting
      const newRelTypes = new Map(suggestionRelationshipTypes);
      newRelTypes.delete(key);
      setSuggestionRelationshipTypes(newRelTypes);
    } else if (newSelected.size < MAX_CONNECTIONS) {
      newSelected.add(key);
      // Initialize with AI suggested type
      const newRelTypes = new Map(suggestionRelationshipTypes);
      newRelTypes.set(key, suggestion.relationshipType);
      setSuggestionRelationshipTypes(newRelTypes);
    } else {
      toast({
        title: "Maximum Connections Reached",
        description: `You can only select up to ${MAX_CONNECTIONS} connections. Remove one to add another.`,
        variant: "destructive"
      });
      return;
    }
    
    setSelectedRelationships(newSelected);
    updateParentWithCurrentSelections(newSelected);
  };

  const updateSuggestionRelationshipType = (suggestionKey: string, newType: string) => {
    const newRelTypes = new Map(suggestionRelationshipTypes);
    newRelTypes.set(suggestionKey, newType);
    setSuggestionRelationshipTypes(newRelTypes);
    updateParentWithCurrentSelections(selectedRelationships);
  };

  const updateParentWithCurrentSelections = (selected: Set<string>) => {
    // Update parent component with current selections
    const relationships = suggestions
      .filter(s => {
        const key = `${s.nodeId}-${s.relationshipType}`;
        return selected.has(key);
      })
      .map(s => {
        const key = `${s.nodeId}-${s.relationshipType}`;
        const selectedType = suggestionRelationshipTypes.get(key) || s.relationshipType;
        return {
          id: s.nodeId,
          type: selectedType,
          confidence: s.confidence
        };
      });
    
    // Add manual connections
    const manualRels = manualConnections
      .filter(conn => conn.nodeId && conn.relationshipType)
      .map(conn => ({ id: conn.nodeId, type: conn.relationshipType, confidence: 0.8 }));
    
    onRelationshipsChange([...relationships, ...manualRels]);
  };

  const addManualConnection = () => {
    logger.debug('Adding manual connection');
    
    if (selectedRelationships.size + manualConnections.length >= MAX_CONNECTIONS) {
      toast({
        title: "Maximum Connections Reached",
        description: `You can only have up to ${MAX_CONNECTIONS} connections total.`,
        variant: "destructive"
      });
      return;
    }
    
    setManualConnections(prev => [...prev, { nodeId: '', relationshipType: '' }]);
  };

  const updateManualConnection = (index: number, field: 'nodeId' | 'relationshipType', value: string) => {
    logger.debug('Updating manual connection', { index, field, value });
    
    setManualConnections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Update parent when both fields are filled
      if (updated[index].nodeId && updated[index].relationshipType) {
        logger.debug('Manual connection complete, updating parent');
        updateParentWithCurrentSelections(selectedRelationships);
      }
      
      return updated;
    });
  };

  const removeManualConnection = (index: number) => {
    setManualConnections(prev => {
      const updated = prev.filter((_, i) => i !== index);
      updateParentWithCurrentSelections(selectedRelationships);
      return updated;
    });
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

  const getNodeTypeLabel = (nodeType: string) => {
    switch (nodeType) {
      case 'issue': return 'Issue';
      case 'position': return 'Position';  
      case 'argument': return 'Argument';
      default: return 'Node';
    }
  };

  // Always show connection interface regardless of AI status
  return (
    <div className="space-y-4 max-h-96 overflow-y-auto pr-2">

      {loading && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <LoadingSpinner className="h-4 w-4" />
          <span className="text-sm text-muted-foreground">Analysing relationships...</span>
        </div>
      )}

      {/* Manual Connections Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Manual Connections</Label>
          {totalConnections < MAX_CONNECTIONS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addManualConnection}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Connection
            </Button>
          )}
        </div>

        {manualConnections.length === 0 && (
          <div className="text-sm text-muted-foreground">
            {existingNodes.length === 0 ? 'No existing items to connect to.' : 'Click "Add Connection" to manually link to existing items.'}
          </div>
        )}

        <div className="max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          {manualConnections.map((connection, index) => (
             <Card key={index} className="p-3 bg-muted/20">
               <div>
                 <div className="flex items-center justify-between">
                  <Label className="text-sm">Connection #{index + 1}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeManualConnection(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Connect to</Label>
                    <Select
                      value={connection.nodeId}
                      onValueChange={(value) => updateManualConnection(index, 'nodeId', value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border shadow-lg z-50">
                        {existingNodes.map(node => (
                           <SelectItem key={node.id} value={node.id}>
                             <div className="flex items-center gap-2">
                               <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                 {getNodeTypeLabel(node.node_type)}
                               </Badge>
                               <span className="truncate">{node.title}</span>
                             </div>
                           </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-xs">Relationship</Label>
                    <Select
                      value={connection.relationshipType}
                      onValueChange={(value) => updateManualConnection(index, 'relationshipType', value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select type" />
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

       {/* Summary of selected connections */}
       {totalConnections > 0 && (
         <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
           <h6 className="text-sm font-medium mb-2 flex items-center gap-2">
             <CheckCircle2 className="h-4 w-4 text-primary" />
             Selected Connections ({totalConnections}/{MAX_CONNECTIONS})
           </h6>
           <div className="space-y-1 text-xs text-muted-foreground">
             {suggestions
               .filter(s => selectedRelationships.has(`${s.nodeId}-${s.relationshipType}`))
               .map(s => {
                 const key = `${s.nodeId}-${s.relationshipType}`;
                 const selectedType = suggestionRelationshipTypes.get(key) || s.relationshipType;
                 return (
                    <div key={key} className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                        {getNodeTypeLabel(s.nodeType)}
                      </Badge>
                      <span className="font-medium">{s.nodeTitle.slice(0, 30)}...</span>
                      <ArrowRight className="h-3 w-3 text-primary" />
                      <span className="text-primary">{formatRelationshipType(selectedType)}</span>
                      <Badge variant="outline" className="text-xs">AI</Badge>
                    </div>
                 );
               })}
             {manualConnections
               .filter(conn => conn.nodeId && conn.relationshipType)
               .map((conn, index) => {
                 const node = existingNodes.find(n => n.id === conn.nodeId);
                 return (
                    <div key={`manual-${index}`} className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                        {node ? getNodeTypeLabel(node.node_type) : 'Node'}
                      </Badge>
                      <span className="font-medium">{node ? node.title.slice(0, 30) + '...' : 'Unknown'}</span>
                      <ArrowRight className="h-3 w-3 text-primary" />
                      <span className="text-primary">{formatRelationshipType(conn.relationshipType)}</span>
                      <Badge variant="outline" className="text-xs">Manual</Badge>
                    </div>
                 );
               })}
           </div>
        </div>
      )}
    </div>
  );
};