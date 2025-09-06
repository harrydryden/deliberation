import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, CheckCircle } from "lucide-react";
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { EnhancedRelationshipSelector } from './EnhancedRelationshipSelector';
import { useStanceService } from '@/hooks/useServices';
import { IssueRecommendations } from '@/components/ibis/IssueRecommendations';
interface IbisSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  messageContent: string;
  deliberationId: string;
  onSuccess?: () => void;
}
type NodeType = 'issue' | 'position' | 'argument' | 'uncategorized';
export const IbisSubmissionModal = ({
  isOpen,
  onClose,
  messageId,
  messageContent,
  deliberationId,
  onSuccess
}: IbisSubmissionModalProps) => {
  const {
    toast
  } = useToast();
  const { user } = useSupabaseAuth();
  const stanceService = useStanceService();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: messageContent,
    nodeType: '' as NodeType | '',
    parentNodeId: ''
  });
  // Enhanced relationship management
  const [selectedRelationships, setSelectedRelationships] = useState<Array<{
    id: string;
    type: string;
    confidence: number;
  }>>([]);
  
  const [aiSuggestions, setAiSuggestions] = useState<{
    title: string;
    keywords: string[];
    nodeType: NodeType;
    description: string;
    confidence: number;
    stanceScore?: number;
  } | null>(null);
  const [existingNodes, setExistingNodes] = useState<Array<{
    id: string;
    title: string;
    node_type: string;
  }>>([]);
  const [isGeneratingRoots, setIsGeneratingRoots] = useState(false);
  const [rootSuggestion, setRootSuggestion] = useState<{
    message: string;
    action: string;
  } | null>(null);

  // Issue recommendations state
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isLinkingMode, setIsLinkingMode] = useState(false);

  // Load existing nodes and classify message when modal opens
  useEffect(() => {
    if (isOpen) {
      loadExistingNodes();
      classifyMessage();
    }
  }, [isOpen, deliberationId, messageContent]);
  const loadExistingNodes = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('ibis_nodes').select('id, title, node_type').eq('deliberation_id', deliberationId).order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setExistingNodes(data || []);
    } catch (error) {
      console.error('Error loading existing nodes:', error);
    }
  };
  const classifyMessage = async () => {
    if (!messageContent.trim()) return;
    setIsClassifying(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('classify-message', {
        body: {
          content: messageContent,
          deliberationId: deliberationId
        }
      });
      if (error) throw error;
      if (data.success && data.classification) {
        const classification = data.classification;
        setAiSuggestions({
          title: classification.title,
          keywords: classification.keywords,
          nodeType: classification.nodeType,
          description: classification.description,
          confidence: classification.confidence,
          stanceScore: classification.stanceScore
        });

        // Pre-populate form with AI suggestions
        setFormData(prev => ({
          ...prev,
          title: classification.title,
          nodeType: classification.nodeType
        }));
      }

      // Handle root suggestion if provided
      if (data.rootSuggestion) {
        setRootSuggestion(data.rootSuggestion);
      }
    } catch (error: any) {
      console.error('Error classifying message:', error);
      
      // Set fallback state for AI classification failure
      setAiSuggestions({
        title: '',
        keywords: [],
        nodeType: 'issue' as NodeType, // Default to issue
        description: 'AI analysis failed to categorize this message',
        confidence: 0,
        stanceScore: 0
      });
      
      toast({
        title: "AI Classification Failed",
        description: "Unable to get AI suggestions. Please categorize manually or use the uncategorized option.",
        variant: "destructive"
      });
    } finally {
      setIsClassifying(false);
    }
  };
  const applyAiSuggestion = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRelationshipsChange = (relationships: Array<{id: string, type: string, confidence: number}>) => {
    setSelectedRelationships(relationships);
  };

  const handleIssueSelected = (issueId: string) => {
    setSelectedIssueId(selectedIssueId === issueId ? null : issueId);
    setIsLinkingMode(!!issueId);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.nodeType) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please provide a title and select a node type"
      });
      return;
    }
    setIsSubmitting(true);
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      let nodeId: string;

      if (isLinkingMode && selectedIssueId) {
        // Link to existing issue instead of creating new node
        nodeId = selectedIssueId;
        
        // Create relationship to the selected issue
        const { error: relError } = await supabase
          .from('ibis_relationships')
          .insert({
            source_node_id: selectedIssueId,
            target_node_id: selectedIssueId, // Self-reference for position linking
            relationship_type: formData.nodeType === 'position' ? 'addresses' : 'supports',
            created_by: user.id,
            deliberation_id: deliberationId
          });
        
        if (relError) throw relError;
      } else {
        // Create new node as before
        // Calculate intelligent position based on node type and existing nodes
        const calculateNodePosition = (nodeType: string, parentNodeId?: string) => {
          const basePositions = {
            issue: { x: 200, y: 150 },
            position: { x: 400, y: 300 },
            argument: { x: 600, y: 450 }
          };
          
          const base = basePositions[nodeType as keyof typeof basePositions] || { x: 400, y: 300 };
          
          // Add some variation while keeping nodes organized
          const variation = 100;
          const offsetX = Math.random() * variation - variation / 2;
          const offsetY = Math.random() * variation - variation / 2;
          
          return {
            x: Math.max(50, Math.min(800, base.x + offsetX)),
            y: Math.max(50, Math.min(600, base.y + offsetY))
          };
        };
        
        const position = calculateNodePosition(formData.nodeType, formData.parentNodeId);

        const { data: inserted, error: nodeError } = await supabase
          .from('ibis_nodes')
          .insert({
            title: formData.title.trim(),
            description: formData.description.trim() || null,
            node_type: formData.nodeType,
            parent_node_id: formData.parentNodeId && formData.parentNodeId !== 'none' ? formData.parentNodeId : null,
            deliberation_id: deliberationId,
            message_id: messageId,
            created_by: user.id,
            position_x: position.x,
            position_y: position.y
          })
          .select('id, node_type')
          .maybeSingle();
        if (nodeError) throw nodeError;
        if (!inserted) throw new Error('Failed to create node');
        nodeId = inserted.id;
      }

      // Create enhanced relationships from AI analysis (only for new nodes)
      if (!isLinkingMode && selectedRelationships.length > 0) {
        const relationshipInserts = selectedRelationships.map(rel => ({
          source_node_id: nodeId,
          target_node_id: rel.id,
          relationship_type: rel.type,
          created_by: user.id,
          deliberation_id: deliberationId
        }));
        
        const { error: relErr } = await supabase
          .from('ibis_relationships')
          .insert(relationshipInserts);
        
        if (relErr) throw relErr;
      }

      // Store stance score if available from AI classification
      if (aiSuggestions?.stanceScore !== undefined) {
        try {
          await stanceService.updateStanceScore(
            user.id,
            deliberationId,
            aiSuggestions.stanceScore,
            aiSuggestions.confidence || 0.5,
            {
              source: 'ibis_submission',
              nodeType: formData.nodeType,
              keywords: aiSuggestions.keywords,
              messageId
            }
          );
        } catch (stanceError) {
          console.error('Failed to store stance score:', stanceError);
          // Don't fail the entire submission if stance storage fails
        }
      }

      // Mark message as submitted to IBIS
      const {
        error: messageError
      } = await supabase.from('messages').update({
        submitted_to_ibis: true
      }).eq('id', messageId);
      if (messageError) throw messageError;
      toast({
        title: "Success",
        description: isLinkingMode 
          ? "Message linked to existing issue successfully"
          : "Message successfully submitted to IBIS"
      });
      onSuccess?.();
      onClose();

      // Reset form and AI suggestions
      setFormData({
        title: '',
        description: messageContent,
        nodeType: '',
        parentNodeId: ''
      });
      setAiSuggestions(null);
      setSelectedRelationships([]);
      setSelectedIssueId(null);
      setIsLinkingMode(false);
    } catch (error: any) {
      console.error('Error submitting to IBIS:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit message to IBIS"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleGenerateRootIssues = async () => {
    setIsGeneratingRoots(true);
    try {
      // Get deliberation details
      const {
        data: deliberation,
        error: deliberationError
      } = await supabase.from('deliberations').select('title, description, notion').eq('id', deliberationId).single();
      if (deliberationError) throw deliberationError;
      const {
        data: rootsData,
        error: rootsError
      } = await supabase.functions.invoke('generate-ibis-roots', {
        body: {
          deliberationId,
          deliberationTitle: deliberation.title,
          deliberationDescription: deliberation.description,
          notion: deliberation.notion
        }
      });
      if (rootsError) throw rootsError;
      if (rootsData?.success) {
        toast({
          title: "Success",
          description: `Generated ${rootsData.count} root issues for this deliberation`
        });
        // Reload existing nodes to show the new ones
        await loadExistingNodes();
      }
    } catch (error: any) {
      console.error('Error generating root issues:', error);
      toast({
        title: "Error",
        description: "Failed to generate root issues. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingRoots(false);
    }
  };
  const getNodeTypeDescription = (nodeType: string) => {
    switch (nodeType) {
      case 'issue':
        return 'A problem or question that needs to be resolved';
      case 'position':
        return 'A proposed solution or stance on an issue';
      case 'argument':
        return 'Supporting or opposing evidence for a position';
      default:
        return '';
    }
  };
  return <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to Deliberation Map</DialogTitle>
        </DialogHeader>

        {/* AI Classification Status */}
        {isClassifying && <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <LoadingSpinner className="h-4 w-4" />
            <span className="text-sm text-muted-foreground">Analysing message</span>
          </div>}

        {/* No existing nodes - suggest root issues */}
        {existingNodes.length === 0 && !isClassifying && <div className="p-3 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">No IBIS nodes exist yet</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Start this deliberation by generating AI-suggested root issues, or create your own manually.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleGenerateRootIssues} disabled={isGeneratingRoots} className="flex items-center gap-2">
              {isGeneratingRoots ? <>
                  <LoadingSpinner className="h-3 w-3" />
                  Generating...
                </> : <>
                  <Lightbulb className="h-3 w-3" />
                  Suggest Root Issues
                </>}
            </Button>
          </div>}

        {/* AI Suggestions */}
        {aiSuggestions && !isClassifying && <div className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Suggestions</span>
              <Badge variant="secondary" className="text-xs">
                {Math.round(aiSuggestions.confidence * 100)}% confidence
              </Badge>
            </div>
            
            {aiSuggestions.keywords.length > 0 && <div>
                <span className="text-xs text-muted-foreground">Keywords: </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {aiSuggestions.keywords.map((keyword, index) => <Badge key={index} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>)}
                </div>
              </div>}
            
            {aiSuggestions.stanceScore !== undefined && <div>
                <span className="text-xs text-muted-foreground">Stance: </span>
                <Badge variant={aiSuggestions.stanceScore > 0.3 ? "default" : aiSuggestions.stanceScore < -0.3 ? "destructive" : "secondary"} className="text-xs">
                  {aiSuggestions.stanceScore > 0.3 ? "Supporting" : aiSuggestions.stanceScore < -0.3 ? "Opposing" : "Neutral"} ({(aiSuggestions.stanceScore >= 0 ? '+' : '') + aiSuggestions.stanceScore.toFixed(2)})
                </Badge>
              </div>}
          </div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nodeType">Type</Label>
            <Select value={formData.nodeType} onValueChange={(value: NodeType) => setFormData(prev => ({
            ...prev,
            nodeType: value
          }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="issue">
                  <div>
                    <div className="font-medium">Issue</div>
                    <div className="text-xs text-muted-foreground">
                      A problem or question to be resolved
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="position">
                  <div>
                    <div className="font-medium">Position</div>
                    <div className="text-xs text-muted-foreground">
                      A proposed solution or stance
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="argument">
                  <div>
                    <div className="font-medium">Argument</div>
                    <div className="text-xs text-muted-foreground">
                      Supporting or opposing evidence
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="uncategorized">
                  <div>
                    <div className="font-medium">Uncategorized</div>
                    <div className="text-xs text-muted-foreground">
                      AI failed to categorize - manual review needed
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={formData.title} onChange={e => setFormData(prev => ({
            ...prev,
            title: e.target.value
          }))} placeholder="Enter concise title for the map" required />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={formData.description} onChange={e => setFormData(prev => ({
            ...prev,
            description: e.target.value
          }))} placeholder="Detailed description (optional)" rows={3} />
          </div>

          {/* Connections Section - Always show when there are existing nodes */}
          {existingNodes.length > 0 && formData.description.trim() && (
            <div className="border-t pt-4 mt-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Connect to Existing Items</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Link your contribution to existing issues, positions, or arguments in the deliberation map.
                </p>
              </div>

              {/* Show linking mode indicator */}
              {isLinkingMode && selectedIssueId && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Linking to existing issue</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your submission will be linked to the selected issue instead of creating a new node.
                  </p>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setIsLinkingMode(false);
                      setSelectedIssueId(null);
                    }}
                    className="mt-2 h-6 px-2 text-xs"
                  >
                    Create new node instead
                  </Button>
                </div>
              )}

              {/* Issue Recommendations - Always show when not in linking mode */}
              {!isLinkingMode && (
                <IssueRecommendations
                  deliberationId={deliberationId}
                  userContent={formData.description || messageContent}
                  onIssueSelected={handleIssueSelected}
                />
              )}

              {/* Enhanced Relationship Selector - Show when creating new nodes */}
              {!isLinkingMode && formData.title.trim() && (
                <EnhancedRelationshipSelector
                  deliberationId={deliberationId}
                  content={formData.description || messageContent}
                  title={formData.title}
                  nodeType={(formData.nodeType || 'issue') as 'issue' | 'position' | 'argument'}
                  onRelationshipsChange={handleRelationshipsChange}
                />
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sharing...' : 'Share'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>;
};