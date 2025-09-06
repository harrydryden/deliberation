import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Lightbulb, CheckCircle } from "lucide-react";
import { ManualNodeSelector } from './ManualNodeSelector';
import { IssueRecommendations } from '@/components/ibis/IssueRecommendations';
import { IBISService } from '@/services/domain/implementations/ibis.service';
import { useIbisSubmission } from '@/hooks/useIbisSubmission';
import { useIbisClassification } from '@/hooks/useIbisClassification';
import { NODE_TYPE_OPTIONS } from '@/constants/ibisTypes';

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
  const ibisService = new IBISService();
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: messageContent,
    nodeType: '' as NodeType | '',
    parentNodeId: ''
  });

  // Enhanced relationship management - separate tracking for different sources
  const [issueRecommendationRelationships, setIssueRecommendationRelationships] = useState<Array<{
    id: string;
    type: string;
    confidence: number;
  }>>([]);
  
  const [manualRelationships, setManualRelationships] = useState<Array<{
    id: string;
    type: string;
    confidence: number;
  }>>([]);

  // Combined relationships for submission
  const selectedRelationships = [...issueRecommendationRelationships, ...manualRelationships];

  const [existingNodes, setExistingNodes] = useState<Array<{
    id: string;
    title: string;
    node_type: string;
  }>>([]);
  const [isGeneratingRoots, setIsGeneratingRoots] = useState(false);

  // Issue recommendations state
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  
  // Use custom hooks for better separation of concerns
  const { submitToIbis, isSubmitting } = useIbisSubmission(
    deliberationId,
    messageId,
    messageContent,
    () => {
      onSuccess?.();
      onClose();
      resetForm();
    }
  );
  
  const { aiSuggestions, rootSuggestion, isClassifying } = useIbisClassification(
    messageContent,
    deliberationId,
    isOpen
  );

  // Load existing nodes when modal opens
  useEffect(() => {
    if (isOpen) {
      loadExistingNodes();
    }
  }, [isOpen, deliberationId]);

  // Pre-populate form with AI suggestions
  useEffect(() => {
    if (aiSuggestions && !formData.title) {
      setFormData(prev => ({
        ...prev,
        title: aiSuggestions.title,
        nodeType: aiSuggestions.nodeType as NodeType
      }));
    }
  }, [aiSuggestions]);

  const resetForm = () => {
    setFormData({
      title: '',
      description: messageContent,
      nodeType: '',
      parentNodeId: ''
    });
    setIssueRecommendationRelationships([]);
    setManualRelationships([]);
    setSelectedIssueId(null);
    setIsLinkingMode(false);
  };

  const loadExistingNodes = async () => {
    try {
      const nodes = await ibisService.getExistingNodes(deliberationId);
      setExistingNodes(nodes);
    } catch (error) {
      console.error('Error loading existing nodes:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const submissionData = {
      title: formData.title,
      description: formData.description,
      nodeType: formData.nodeType,
      parentNodeId: formData.parentNodeId,
      issueRecommendationRelationships,
      manualRelationships,
      selectedIssueId,
      isLinkingMode
    };

    await submitToIbis(submissionData, aiSuggestions || undefined);
  };

  const applyAiSuggestion = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleIssueRecommendationsChange = (relationships: Array<{id: string, type: string, confidence: number}>) => {
    setIssueRecommendationRelationships(relationships);
  };

  const handleManualConnectionsChange = (relationships: Array<{id: string, type: string, confidence: number}>) => {
    setManualRelationships(relationships);
  };

  const handleIssueSelected = (issueId: string) => {
    setSelectedIssueId(selectedIssueId === issueId ? null : issueId);
  };

  const handleGenerateRootIssues = async () => {
    setIsGeneratingRoots(true);
    try {
      const result = await ibisService.generateRootIssues(deliberationId);
      if (result.success) {
        await loadExistingNodes(); // Reload nodes to show new ones
      }
    } catch (error) {
      console.error('Error generating root issues:', error);
    } finally {
      setIsGeneratingRoots(false);
    }
  };

  const getNodeTypeDescription = (nodeType: string) => {
    const option = NODE_TYPE_OPTIONS.find(opt => opt.value === nodeType);
    return option?.description || '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to Deliberation Map</DialogTitle>
        </DialogHeader>

        {/* AI Classification Status */}
        {isClassifying && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <LoadingSpinner className="h-4 w-4" />
            <span className="text-sm text-muted-foreground">Analysing message</span>
          </div>
        )}

        {/* No existing nodes - suggest root issues */}
        {existingNodes.length === 0 && !isClassifying && (
          <div className="p-3 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">No IBIS nodes exist yet</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Start this deliberation by generating AI-suggested root issues, or create your own manually.
            </p>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={handleGenerateRootIssues} 
              disabled={isGeneratingRoots}
              className="flex items-center gap-2"
            >
              {isGeneratingRoots ? (
                <>
                  <LoadingSpinner className="h-3 w-3" />
                  Generating...
                </>
              ) : (
                <>
                  <Lightbulb className="h-3 w-3" />
                  Suggest Root Issues
                </>
              )}
            </Button>
          </div>
        )}

        {/* AI Suggestions */}
        {aiSuggestions && !isClassifying && (
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Suggestions</span>
              <Badge variant="secondary" className="text-xs">
                {Math.round(aiSuggestions.confidence * 100)}% confidence
              </Badge>
            </div>
            
            {aiSuggestions.keywords.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Keywords: </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {aiSuggestions.keywords.map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {aiSuggestions.stanceScore !== undefined && (
              <div>
                <span className="text-xs text-muted-foreground">Stance: </span>
                <Badge 
                  variant={aiSuggestions.stanceScore > 0.3 ? "default" : aiSuggestions.stanceScore < -0.3 ? "destructive" : "secondary"} 
                  className="text-xs"
                >
                  {aiSuggestions.stanceScore > 0.3 ? "Supporting" : aiSuggestions.stanceScore < -0.3 ? "Opposing" : "Neutral"} 
                  ({(aiSuggestions.stanceScore >= 0 ? '+' : '') + aiSuggestions.stanceScore.toFixed(2)})
                </Badge>
              </div>
            )}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Field */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="title">Title *</Label>
              {aiSuggestions?.title && formData.title !== aiSuggestions.title && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => applyAiSuggestion('title', aiSuggestions.title)}
                  className="h-6 text-xs"
                >
                  Use AI suggestion
                </Button>
              )}
            </div>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter a clear, descriptive title"
              required
            />
          </div>

          {/* Node Type Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="nodeType">Type *</Label>
              {aiSuggestions?.nodeType && formData.nodeType !== aiSuggestions.nodeType && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => applyAiSuggestion('nodeType', aiSuggestions.nodeType)}
                  className="h-6 text-xs"
                >
                  Use AI suggestion: {aiSuggestions.nodeType}
                </Button>
              )}
            </div>
            <Select value={formData.nodeType} onValueChange={(value) => setFormData(prev => ({ ...prev, nodeType: value as NodeType }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select node type" />
              </SelectTrigger>
              <SelectContent>
                {NODE_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Add additional context or details"
              rows={3}
            />
          </div>

          {/* Issue Recommendations */}
          {existingNodes.length > 0 && (
            <IssueRecommendations
              deliberationId={deliberationId}
              userContent={messageContent}
              onIssueSelected={handleIssueSelected}
              onRelationshipsChange={handleIssueRecommendationsChange}
            />
          )}

          {/* Manual Node Selector */}
          {existingNodes.length > 0 && (
            <ManualNodeSelector
              existingNodes={existingNodes}
              onConnectionsChange={handleManualConnectionsChange}
            />
          )}

          {/* Relationship Summary */}
          {selectedRelationships.length > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <Label className="text-sm font-medium">Selected Relationships ({selectedRelationships.length})</Label>
              <div className="mt-2 space-y-1">
                {selectedRelationships.map((rel, index) => {
                  const node = existingNodes.find(n => n.id === rel.id);
                  return (
                    <div key={`${rel.id}-${rel.type}-${index}`} className="text-xs text-muted-foreground">
                      {rel.type} → {node?.title || 'Unknown node'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <DialogFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.title.trim() || !formData.nodeType}>
              {isSubmitting ? (
                <>
                  <LoadingSpinner className="w-4 h-4 mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Submit to IBIS
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};