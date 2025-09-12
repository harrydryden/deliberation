import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Lightbulb, CheckCircle, RotateCcw } from "lucide-react";
import { EnhancedRelationshipSelector } from './EnhancedRelationshipSelector';
import { IssueRecommendations } from '@/components/ibis/IssueRecommendations';
import SimilarIbisNodes from './SimilarIbisNodes';
import { IBISService } from '@/services/domain/implementations/ibis.service';
import { useIbisSubmission } from '@/hooks/useIbisSubmission';
import { useIbisClassification } from '@/hooks/useIbisClassification';
import { NODE_TYPE_OPTIONS } from '@/constants/ibisTypes';
import { createComponentLogger } from '@/utils/productionLogger';

const logger = createComponentLogger('IbisSubmissionModal');

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

  // Enhanced relationship management - unified smart + manual connections
  const [smartConnections, setSmartConnections] = useState<Array<{
    id: string;
    type: string;
    confidence: number;
  }>>([]);

  // Issue recommendations and similar nodes state
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [issueRecommendations, setIssueRecommendations] = useState<Array<{id: string, type: string, confidence: number}>>([]);
  const [similarNodes, setSimilarNodes] = useState<any[]>([]);

  // Combined relationships for submission
  const selectedRelationships = [...smartConnections, ...issueRecommendations];

  const [existingNodes, setExistingNodes] = useState<Array<{
    id: string;
    title: string;
    node_type: string;
  }>>([]);
  const [isGeneratingRoots, setIsGeneratingRoots] = useState(false);
  
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

  // Reset and populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      logger.debug('Modal opened, resetting state');
      // Clear all relationship states for fresh start
      setSmartConnections([]);
      setIssueRecommendations([]);
      setSimilarNodes([]);
      setSelectedIssueId(null);
      setIsLinkingMode(false);
      setModalKey(Date.now());
      
      // Populate description with message content
      if (messageContent) {
        setFormData(prev => ({
          ...prev,
          description: messageContent
        }));
      }
    }
  }, [isOpen, messageContent]);

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
    logger.debug('Resetting form state');
    setFormData({
      title: '',
      description: messageContent,
      nodeType: '',
      parentNodeId: ''
    });
    setSmartConnections([]);
    setIssueRecommendations([]);
    setSimilarNodes([]);
    setSelectedIssueId(null);
    setIsLinkingMode(false);
    
    // Reset child components via refs or state
    setModalKey(Date.now()); // Force re-render to reset child states
  };

  // Add modal key for forced resets
  const [modalKey, setModalKey] = useState(Date.now());

  const loadExistingNodes = async () => {
    try {
      const nodes = await ibisService.getExistingNodes(deliberationId);
      setExistingNodes(nodes);
    } catch (error) {
      logger.error('Error loading existing nodes:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const submissionData = {
      title: formData.title,
      description: formData.description,
      nodeType: formData.nodeType,
      parentNodeId: formData.parentNodeId,
      smartConnections: [...smartConnections, ...issueRecommendations],
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

  const handleSmartConnectionsChange = useCallback((relationships: Array<{id: string, type: string, confidence: number}>) => {
    logger.debug('Smart connections changed:', { count: relationships.length });
    setSmartConnections(relationships);
  }, []);

  const handleIssueRecommendationsChange = useCallback((relationships: Array<{id: string, type: string, confidence: number}>) => {
    logger.debug('Issue recommendations changed:', { count: relationships.length });
    setIssueRecommendations(relationships);
  }, []);

  const handleIssueSelected = (issueId: string) => {
    setSelectedIssueId(selectedIssueId === issueId ? null : issueId);
  };

  const handleGenerateRootIssues = async () => {
    setIsGeneratingRoots(true);
    try {
      logger.info('Manual root issue generation is no longer supported. Use the "Create Issues" button in admin interface.');
      // This feature has been replaced with manual creation in the admin interface
      await loadExistingNodes(); // Just reload to refresh
    } catch (error) {
      logger.error('Error refreshing nodes:', error);
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
          <DialogTitle>Add to the Deliberation</DialogTitle>
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
                  Use suggestion
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
                  Use suggestion: {aiSuggestions.nodeType}
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
                    <div className="flex flex-col text-left">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Badge variant="outline" className="text-xs">
                  Auto-filled from message
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formData.description.length} characters
                </span>
                {formData.description !== messageContent && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, description: messageContent }))}
                    className="h-6 text-xs"
                    title="Reset to original message"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Your message content has been auto-filled. Add additional context if needed."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Your message content is automatically copied here. You can edit or add more details.
            </p>
          </div>

          {/* Issue Recommendations - AI-powered with relationship types */}
          <IssueRecommendations
            key={`issue-rec-${modalKey}`}
            deliberationId={deliberationId}
            userContent={messageContent}
            onIssueSelected={handleIssueSelected}
            onRelationshipsChange={handleIssueRecommendationsChange}
            className="mb-4"
          />

          {/* Enhanced Relationship Selector - Smart + Manual Connections */}
          {existingNodes.length > 0 ? (
            <div className="space-y-2">
              <EnhancedRelationshipSelector
                key={`enhanced-rel-${modalKey}`}
                deliberationId={deliberationId}
                content={messageContent}
                title={formData.title}
                nodeType={formData.nodeType as 'issue' | 'position' | 'argument'}
                onRelationshipsChange={handleSmartConnectionsChange}
              />
            </div>
          ) : (
            <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
              No existing nodes found. Enhanced relationship selector will activate once nodes exist.
            </div>
          )}

          {/* Similar IBIS Nodes - Show related contributions */}
          {similarNodes.length > 0 && (
            <SimilarIbisNodes
              nodes={similarNodes}
              messageId={messageId}
              deliberationId={deliberationId}
            />
          )}

          {/* Enhanced Relationship Summary with User Control */}
          {selectedRelationships.length > 0 && (
            <div className="p-3 bg-muted rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Selected Relationships ({selectedRelationships.length})</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    logger.debug('Clearing all relationships');
                    setSmartConnections([]);
                    setIssueRecommendations([]);
                  }}
                  className="h-6 text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear All
                </Button>
              </div>
              
              <div className="space-y-2">
                {selectedRelationships.map((rel, index) => {
                  const node = existingNodes.find(n => n.id === rel.id);
                  const isFromIssueRec = issueRecommendations.some(ir => ir.id === rel.id);
                  return (
                    <div key={`${rel.id}-${rel.type}-${index}`} className="flex items-center justify-between p-2 bg-background rounded border">
                      <div className="flex items-center gap-2">
                        <Badge variant={isFromIssueRec ? "secondary" : "outline"} className="text-xs">
                          {isFromIssueRec ? "AI Issue" : "AI Connect"}
                        </Badge>
                        <span className="text-sm font-medium">{rel.type}</span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-sm">{node?.title || 'Unknown node'}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          logger.debug('Removing relationship', { id: rel.id, type: rel.type });
                          if (isFromIssueRec) {
                            setIssueRecommendations(prev => prev.filter(ir => ir.id !== rel.id));
                          } else {
                            setSmartConnections(prev => prev.filter(sc => sc.id !== rel.id));
                          }
                        }}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        ✕
                      </Button>
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
                  Share
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};