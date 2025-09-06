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

interface RelationshipSuggestion {
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  relationshipType: string;
  confidence: number;
  reasoning: string;
  semanticSimilarity: number;
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
    console.log('🟡 EVALUATE RELATIONSHIPS CLICKED');
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
    console.log('🟢 ADD MANUAL CONNECTION CLICKED');
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
    console.log('🟠 MANUAL CONNECTION UPDATE:', { index, field, value });
    setManualConnections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Update parent when both fields are filled
      if (updated[index].nodeId && updated[index].relationshipType) {
        console.log('🟠 UPDATING PARENT WITH RELATIONSHIPS');
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

  const getNodeTypeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'issue': return '❓';
      case 'position': return '💭';  
      case 'argument': return '📝';
      default: return '📄';
    }
  };

  // Always show connection interface regardless of AI status
  return (
    <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
      <div className="flex items-center justify-between sticky top-0 bg-background z-10 pb-2">
        <Label className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Connect to Existing Items
        </Label>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {totalConnections}/{MAX_CONNECTIONS}
          </Badge>
          {!evaluated && !loading && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={evaluateRelationships}
              className="flex items-center gap-2"
            >
              <Zap className="h-3 w-3" />
              Get AI Suggestions
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <LoadingSpinner className="h-4 w-4" />
          <span className="text-sm text-muted-foreground">Analysing relationships...</span>
        </div>
      )}

      {/* AI Suggestions Section */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">AI Suggestions</Label>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
             {suggestions.slice(0, 8).map((suggestion, index) => {
               const key = `${suggestion.nodeId}-${suggestion.relationshipType}`;
               const isSelected = selectedRelationships.has(key);
               const canSelect = totalConnections < MAX_CONNECTIONS || isSelected;
               const selectedRelType = suggestionRelationshipTypes.get(key) || suggestion.relationshipType;
               
               return (
                 <Card
                   key={key}
                   className={`transition-all hover:shadow-sm ${
                     isSelected 
                       ? 'ring-2 ring-primary bg-primary/5' 
                       : canSelect 
                         ? 'hover:border-primary/50'
                         : 'opacity-60 cursor-not-allowed hover:border-border'
                   }`}
                 >
                   <CardContent className="p-3">
                     <div className="flex items-start gap-3">
                       <div className="flex-shrink-0 mt-1">
                         <div 
                           className={`h-4 w-4 rounded-full border-2 cursor-pointer transition-colors ${
                             isSelected 
                               ? 'bg-primary border-primary' 
                               : canSelect 
                                 ? 'border-border hover:border-primary'
                                 : 'border-muted-foreground'
                           }`}
                           onClick={() => canSelect && toggleRelationship(suggestion)}
                         >
                           {isSelected && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                         </div>
                       </div>
                       
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-1">
                           <span className="text-lg">{getNodeTypeIcon(suggestion.nodeType)}</span>
                           <span className="font-medium text-sm truncate">
                             {suggestion.nodeTitle}
                           </span>
                         </div>
                         
                         <div className="flex items-center gap-2 mb-2">
                           <Badge variant="outline" className="text-xs bg-muted/50">
                             AI suggests: {formatRelationshipType(suggestion.relationshipType)}
                           </Badge>
                           <Badge variant="outline" className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}>
                             {Math.round(suggestion.confidence * 100)}% confidence
                           </Badge>
                         </div>

                         {isSelected && (
                           <div className="mb-2">
                             <Label className="text-xs">Connection Type</Label>
                             <Select
                               value={selectedRelType}
                               onValueChange={(value) => updateSuggestionRelationshipType(key, value)}
                             >
                               <SelectTrigger className="h-7 text-xs">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent className="bg-background border border-border shadow-lg z-50">
                                 <SelectItem value="supports">Supports</SelectItem>
                                 <SelectItem value="opposes">Opposes</SelectItem>
                                 <SelectItem value="addresses">Addresses</SelectItem>
                                 <SelectItem value="relates_to">Relates To</SelectItem>
                                 <SelectItem value="builds_on">Builds On</SelectItem>
                                 <SelectItem value="questions">Questions</SelectItem>
                                 <SelectItem value="counters">Counters</SelectItem>
                                 <SelectItem value="strengthens">Strengthens</SelectItem>
                                 <SelectItem value="refines">Refines</SelectItem>
                               </SelectContent>
                             </Select>
                           </div>
                         )}
                         
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

        <div className="space-y-3 max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          {manualConnections.map((connection, index) => (
            <Card key={index} className="p-3 bg-muted/20">
              <div className="space-y-3">
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
                              <span>{getNodeTypeIcon(node.node_type)}</span>
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
                        <SelectItem value="supports">Supports</SelectItem>
                        <SelectItem value="opposes">Opposes</SelectItem>
                        <SelectItem value="addresses">Addresses</SelectItem>
                        <SelectItem value="relates_to">Relates To</SelectItem>
                        <SelectItem value="builds_on">Builds On</SelectItem>
                        <SelectItem value="questions">Questions</SelectItem>
                        <SelectItem value="counters">Counters</SelectItem>
                        <SelectItem value="strengthens">Strengthens</SelectItem>
                        <SelectItem value="refines">Refines</SelectItem>
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
                     <span>{getNodeTypeIcon(s.nodeType)}</span>
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
                     <span>{node ? getNodeTypeIcon(node.node_type) : '📄'}</span>
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