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
import SimilarIbisNodes from './SimilarIbisNodes';
import { IBISService } from '@/services/domain/implementations/ibis.service';
import { useOptimizedIbisSubmission } from '@/hooks/useOptimizedIbisSubmission';
import { useProgressiveAISubmission } from '@/hooks/useProgressiveAISubmission';
import { NODE_TYPE_OPTIONS } from '@/constants/ibisTypes';
import { createLogger } from '@/utils/logger';

const logger = createLogger('IbisSubmissionModal');

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

  // Title source tracking to handle AI suggestions properly
  const [titleSource, setTitleSource] = useState<'empty' | 'user' | 'ai' | 'fallback'>('empty');

  // Enhanced relationship management - unified smart + manual + similar nodes connections
  const [smartConnections, setSmartConnections] = useState<Array<{
    id: string;
    type: string;
    confidence: number;
  }>>([]);

  // Similar nodes relationships
  const [similarNodesRelationships, setSimilarNodesRelationships] = useState<Array<{
    id: string;
    type: string;
    confidence: number;
  }>>([]);

  // Issue recommendations and similar nodes state
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [similarNodes, setSimilarNodes] = useState<any[]>([]);

  // Combined relationships for submission
  const selectedRelationships = [...smartConnections, ...similarNodesRelationships];

  const [existingNodes, setExistingNodes] = useState<Array<{
    id: string;
    title: string;
    node_type: string;
    description?: string;
    created_by?: string;
  }>>([]);
  
  // Use optimized hooks for performance
  const { submitToIbis, isSubmitting } = useOptimizedIbisSubmission(
    deliberationId,
    messageId,
    messageContent,
    () => {
      onSuccess?.();
      onClose();
      resetForm();
    }
  );
  
  const { aiState, retryOperation, isAnyLoading } = useProgressiveAISubmission(
    messageContent,
    deliberationId,
    isOpen
  );

  // Extract data from progressive AI state
  const aiSuggestions = aiState.classification.data;
  const isClassifying = aiState.classification.loading;

  // Reset and populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      logger.debug('Modal opened, resetting state');
      // Clear all relationship states for fresh start
      setSmartConnections([]);
      setSimilarNodesRelationships([]);
      setSimilarNodes([]);
      setSelectedIssueId(null);
      setIsLinkingMode(false);
      setModalKey(Date.now());
      setTitleSource('empty');
      
      // Populate description but wait for AI to suggest title
      if (messageContent) {
        setFormData(prev => ({
          ...prev,
          description: messageContent,
          title: '' // Don't set initial title - let AI suggest it
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

  // Apply AI suggestions when available
  useEffect(() => {
    if (aiSuggestions && aiSuggestions.title && aiSuggestions.title !== "Awaiting message content for analysis") {
      // Only apply AI title if user hasn't manually entered one
      if (titleSource === 'empty' || titleSource === 'fallback') {
        setFormData(prev => ({
          ...prev,
          title: aiSuggestions.title,
          nodeType: aiSuggestions.nodeType as NodeType
        }));
        setTitleSource('ai');
      }
    }
  }, [aiSuggestions, titleSource]);

  // Update similar nodes from relationships data
  useEffect(() => {
    if (aiState.relationships.data && aiState.relationships.data.length > 0) {
      logger.debug('Updating similar nodes from relationships', { 
        relationshipsCount: aiState.relationships.data.length 
      });
      
      // Transform relationships data to SimilarIbisNodes format
      const transformedNodes = aiState.relationships.data.map(rel => {
        const similarity =
          typeof rel.similarity === 'number' ? rel.similarity :
          typeof rel.strength === 'number' ? rel.strength :
          typeof rel.confidence === 'number' ? rel.confidence : 0.5;
        const relationshipType = (rel as any).relationshipType || (rel as any).type || 'relates_to';
        return {
          id: rel.targetNodeId || rel.id,
          title: rel.targetNodeTitle || rel.title || 'Unknown Node',
          nodeType: rel.nodeType || 'issue',
          relationshipType,
          similarity: Math.max(0, Math.min(1, similarity)),
          confidence: typeof rel.confidence === 'number' ? rel.confidence : 0.7,
          description: (rel as any).description,
          reasoning: (rel as any).reasoning
        };
      });
      
      setSimilarNodes(transformedNodes);
    }
  }, [aiState.relationships.data]);

  const resetForm = () => {
    logger.debug('Resetting form state');
    setFormData({
      title: '',
      description: messageContent,
      nodeType: '',
      parentNodeId: ''
    });
    setTitleSource('empty');
    setSmartConnections([]);
    setSimilarNodesRelationships([]);
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
      // Fetch nodes with full details for proper display
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: nodes, error } = await supabase
        .from('ibis_nodes')
        .select('id, title, node_type, description, created_by')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error loading existing nodes from supabase:', error);
        // Fallback to service method
        const fallbackNodes = await ibisService.getExistingNodes(deliberationId);
        setExistingNodes(fallbackNodes);
      } else {
        setExistingNodes(nodes || []);
      }
    } catch (error) {
      logger.error('Error loading existing nodes:', error);
      try {
        // Fallback to service method
        const fallbackNodes = await ibisService.getExistingNodes(deliberationId);
        setExistingNodes(fallbackNodes);
      } catch (fallbackError) {
        logger.error('Fallback loading also failed:', fallbackError);
        setExistingNodes([]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const submissionData = {
      title: formData.title,
      description: formData.description,
      nodeType: formData.nodeType,
      parentNodeId: formData.parentNodeId,
      smartConnections: [...smartConnections, ...similarNodesRelationships],
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
    // Track that AI suggestion was applied for title
    if (field === 'title') {
      setTitleSource('ai');
    }
  };

  // Generate fallback title if no AI suggestion and user hasn't entered one
  const generateFallbackTitle = useCallback(() => {
    if (messageContent && (titleSource === 'empty' || !formData.title.trim())) {
      const raw = messageContent.trim();
      const firstSentence = raw.split(/[\n\r.?!]/)[0] || raw;
      const baseTitle = firstSentence.length > 0 ? firstSentence : raw;
      const truncated = baseTitle.slice(0, 100) + (baseTitle.length > 100 ? '...' : '');
      setFormData(prev => ({ ...prev, title: truncated }));
      setTitleSource('fallback');
    }
  }, [messageContent, titleSource, formData.title]);

  // Handle manual title changes
  const handleTitleChange = (value: string) => {
    setFormData(prev => ({ ...prev, title: value }));
    setTitleSource(value.trim() ? 'user' : 'empty');
  };

  const handleSmartConnectionsChange = useCallback((relationships: Array<{id: string, type: string, confidence: number}>) => {
    logger.debug('Smart connections changed:', { count: relationships.length });
    setSmartConnections(relationships);
  }, []);

  const handleSimilarNodesRelationshipsChange = useCallback((relationships: Array<{id: string, type: string, confidence: number}>) => {
    logger.debug('Similar nodes relationships changed:', { count: relationships.length });
    setSimilarNodesRelationships(relationships);
  }, []);

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

        {/* Progressive AI Loading Status */}
        {isAnyLoading && (
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <LoadingSpinner className="h-4 w-4" />
              <span className="text-sm font-medium">Generating suggestions...</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className={`flex items-center gap-1 ${aiState.classification.loading ? 'text-muted-foreground' : 'text-green-600'}`}>
                {aiState.classification.loading ? '⏳' : '✅'} Classification
              </div>
              <div className={`flex items-center gap-1 ${aiState.issueRecommendations.loading ? 'text-muted-foreground' : 'text-green-600'}`}>
                {aiState.issueRecommendations.loading ? '⏳' : '✅'} Issues
              </div>
              <div className={`flex items-center gap-1 ${aiState.relationships.loading ? 'text-muted-foreground' : 'text-green-600'}`}>
                {aiState.relationships.loading ? '⏳' : '✅'} Relations
              </div>
            </div>
          </div>
        )}

        {/* AI Error States with Retry */}
        {(aiState.classification.error || aiState.issueRecommendations.error || aiState.relationships.error) && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg space-y-2">
            <div className="text-sm font-medium text-yellow-800">Some features failed</div>
            <div className="space-y-1 text-xs">
              {aiState.classification.error && (
                <div className="flex items-center justify-between">
                  <span>Classification: {aiState.classification.error}</span>
                  <Button size="sm" variant="ghost" onClick={() => retryOperation('classification')}>Retry</Button>
                </div>
              )}
              {aiState.issueRecommendations.error && (
                <div className="flex items-center justify-between">
                  <span>Issue recommendations: {aiState.issueRecommendations.error}</span>
                  <Button size="sm" variant="ghost" onClick={() => retryOperation('issueRecommendations')}>Retry</Button>
                </div>
              )}
              {aiState.relationships.error && (
                <div className="flex items-center justify-between">
                  <span>Relationships: {aiState.relationships.error}</span>
                  <Button size="sm" variant="ghost" onClick={() => retryOperation('relationships')}>Retry</Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No existing nodes - create manually */}
        {existingNodes.length === 0 && !isClassifying && (
          <div className="p-3 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">No IBIS nodes exist yet</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Create initial nodes manually through the admin interface to get started.
            </p>
          </div>
        )}

        {/* AI Suggestions - Show when available */}
        {aiSuggestions && (
          <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Suggestions Ready</span>
              <Badge variant="secondary" className="text-xs">
                {Math.round(aiSuggestions.confidence * 100)}% confidence
              </Badge>
            </div>
            
            <div className="grid gap-2">
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
          </div>
        )}

        {/* Skeleton loader for AI suggestions while loading */}
        {!aiSuggestions && isClassifying && (
          <div className="p-3 bg-muted rounded-lg space-y-3 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-muted-foreground/20 rounded"></div>
              <div className="h-4 w-24 bg-muted-foreground/20 rounded"></div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-muted-foreground/20 rounded"></div>
              <div className="flex gap-1">
                <div className="h-5 w-16 bg-muted-foreground/20 rounded"></div>
                <div className="h-5 w-12 bg-muted-foreground/20 rounded"></div>
                <div className="h-5 w-20 bg-muted-foreground/20 rounded"></div>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Field */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="title">Title *</Label>
              {isClassifying && titleSource === 'empty' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <LoadingSpinner className="h-3 w-3" />
                  AI suggesting...
                </div>
              )}
              {aiSuggestions?.title && (titleSource !== 'ai' || formData.title !== aiSuggestions.title) && (
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
              {!formData.title.trim() && !isClassifying && !aiSuggestions && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={generateFallbackTitle}
                  className="h-6 text-xs"
                >
                  Generate from message
                </Button>
              )}
            </div>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={isClassifying && titleSource === 'empty' ? "AI is generating a title..." : "Enter a clear, descriptive title"}
              className={titleSource === 'ai' ? 'border-blue-300 bg-blue-50/50' : ''}
              required
            />
            {titleSource === 'ai' && (
              <p className="text-xs text-blue-600">✨ AI suggested this title</p>
            )}
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

          {/* Similar IBIS Nodes - Show related contributions with selection */}
          {similarNodes.length > 0 && (
            <SimilarIbisNodes
              nodes={similarNodes}
              messageId={messageId}
              deliberationId={deliberationId}
              onRelationshipsChange={handleSimilarNodesRelationshipsChange}
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
                    setSimilarNodesRelationships([]);
                  }}
                  className="h-6 text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear All
                </Button>
              </div>
              
              <div className="space-y-2">
                {selectedRelationships.map((rel, index) => {
                  const node = existingNodes.find(n => n.id === rel.id);
                  const isFromSimilarNodes = similarNodesRelationships.some(snr => snr.id === rel.id);
                  return (
                    <div key={`${rel.id}-${rel.type}-${index}`} className="flex items-center justify-between p-2 bg-background rounded border">
                      <div className="flex items-center gap-2">
                        <Badge variant={isFromSimilarNodes ? "secondary" : "outline"} className="text-xs">
                          {isFromSimilarNodes ? "Similar Node" : "AI Connect"}
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
                          if (isFromSimilarNodes) {
                            setSimilarNodesRelationships(prev => prev.filter(snr => snr.id !== rel.id));
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
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !formData.title.trim() || !formData.nodeType}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner className="h-4 w-4" />
                  <span>Sharing...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>Submit</span>
                </div>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};