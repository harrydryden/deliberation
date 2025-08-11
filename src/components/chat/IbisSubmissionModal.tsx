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
import { Lightbulb } from "lucide-react";
interface IbisSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  messageContent: string;
  deliberationId: string;
  onSuccess?: () => void;
}
type NodeType = 'issue' | 'position' | 'argument';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: messageContent,
    nodeType: '' as NodeType | '',
    parentNodeId: ''
  });
  // New link selectors per type
  const [linkIssueId, setLinkIssueId] = useState<string>('');
  const [linkPositionId, setLinkPositionId] = useState<string>('');
  const [linkArgumentId, setLinkArgumentId] = useState<string>('');
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
      toast({
        title: "AI Classification Failed",
        description: "Unable to get AI suggestions. You can still fill the form manually.",
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

  // AI link recommendation per type
  const [linkRecs, setLinkRecs] = useState<{ [K in NodeType]?: { id: string; title: string; score: number } }>({});
  const [linkLoading, setLinkLoading] = useState<{ [K in NodeType]?: boolean }>({});

  const recommendLink = async (targetType: NodeType) => {
    try {
      setLinkLoading(prev => ({ ...prev, [targetType]: true }));
      const baseContent = (formData.title + ' ' + (formData.description || '')).trim() || messageContent;
      const { data, error } = await supabase.functions.invoke('suggest-ibis-links', {
        body: {
          deliberationId,
          content: baseContent,
          targetType,
          threshold: 0.95
        }
      });
      if (error) throw error;
      if (data?.success && data?.suggestion) {
        const { id, title, score } = data.suggestion;
        setLinkRecs(prev => ({ ...prev, [targetType]: { id, title, score } }));
        // Preselect suggestion
        if (targetType === 'issue') setLinkIssueId(id);
        if (targetType === 'position') setLinkPositionId(id);
        if (targetType === 'argument') setLinkArgumentId(id);
        toast({ title: 'AI suggestion applied', description: `${title} (${Math.round(score * 100)}%)` });
      } else {
        toast({ title: 'No high-confidence match', description: 'No link found above 95% similarity.' });
      }
    } catch (e: any) {
      console.error('Recommend link error', e);
      toast({ variant: 'destructive', title: 'AI suggestion failed', description: e.message || 'Try again later.' });
    } finally {
      setLinkLoading(prev => ({ ...prev, [targetType]: false }));
    }
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
      // Create IBIS node
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

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
          position_x: Math.random() * 800 + 100,
          position_y: Math.random() * 600 + 100
        })
        .select('id, node_type')
        .maybeSingle();
      if (nodeError) throw nodeError;
      if (!inserted) throw new Error('Failed to create node');

      // Optional links creation (up to 3)
      const rels: any[] = [];
      const mapRelType = (targetType: NodeType): string => {
        if (targetType === 'issue' && inserted.node_type === 'position') return 'responds_to';
        if (targetType === 'position' && inserted.node_type === 'argument') return 'supports';
        return 'relates_to';
      };
      if (linkIssueId) rels.push({
        source_node_id: inserted.id,
        target_node_id: linkIssueId,
        relationship_type: mapRelType('issue'),
        created_by: user.id,
        deliberation_id: deliberationId
      });
      if (linkPositionId) rels.push({
        source_node_id: inserted.id,
        target_node_id: linkPositionId,
        relationship_type: mapRelType('position'),
        created_by: user.id,
        deliberation_id: deliberationId
      });
      if (linkArgumentId) rels.push({
        source_node_id: inserted.id,
        target_node_id: linkArgumentId,
        relationship_type: mapRelType('argument'),
        created_by: user.id,
        deliberation_id: deliberationId
      });
      if (rels.length) {
        const { error: relErr } = await supabase.from('ibis_relationships').insert(rels);
        if (relErr) throw relErr;
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
        description: "Message successfully submitted to IBIS"
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
      setLinkIssueId('');
      setLinkPositionId('');
      setLinkArgumentId('');
      setLinkRecs({});
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Deliberation Map</DialogTitle>
        </DialogHeader>

        {/* AI Classification Status */}
        {isClassifying && <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <LoadingSpinner className="h-4 w-4" />
            <span className="text-sm text-muted-foreground">AI is analyzing your message...</span>
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
              <span className="text-sm font-medium">AI Suggestions</span>
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

          {existingNodes.length > 0 && (
            <div className="space-y-3">
              <Label>Make Links (Optional)</Label>

              {/* Link to Issue */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="linkIssue">Link to Issue</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => recommendLink('issue')} disabled={!!linkLoading.issue}>
                    {linkLoading.issue ? <LoadingSpinner className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
                    <span className="ml-2 text-xs">AI Recommend</span>
                  </Button>
                </div>
                <Select value={linkIssueId} onValueChange={setLinkIssueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an Issue to link" className="text-muted-foreground" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No link</SelectItem>
                    {existingNodes.filter(n => n.node_type === 'issue').map(node => (
                      <SelectItem key={node.id} value={node.id}>
                        <div>
                          <div className="font-medium">{node.title}</div>
                          <div className="text-xs text-muted-foreground capitalize">Issue</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkRecs.issue && (
                  <div className="mt-1 text-xs text-muted-foreground">Recommended: {linkRecs.issue.title} ({Math.round(linkRecs.issue.score * 100)}%)</div>
                )}
              </div>

              {/* Link to Position */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="linkPosition">Link to Position</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => recommendLink('position')} disabled={!!linkLoading.position}>
                    {linkLoading.position ? <LoadingSpinner className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
                    <span className="ml-2 text-xs">AI Recommend</span>
                  </Button>
                </div>
                <Select value={linkPositionId} onValueChange={setLinkPositionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Position to link" className="text-muted-foreground" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No link</SelectItem>
                    {existingNodes.filter(n => n.node_type === 'position').map(node => (
                      <SelectItem key={node.id} value={node.id}>
                        <div>
                          <div className="font-medium">{node.title}</div>
                          <div className="text-xs text-muted-foreground capitalize">Position</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkRecs.position && (
                  <div className="mt-1 text-xs text-muted-foreground">Recommended: {linkRecs.position.title} ({Math.round(linkRecs.position.score * 100)}%)</div>
                )}
              </div>

              {/* Link to Argument */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="linkArgument">Link to Argument</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => recommendLink('argument')} disabled={!!linkLoading.argument}>
                    {linkLoading.argument ? <LoadingSpinner className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
                    <span className="ml-2 text-xs">AI Recommend</span>
                  </Button>
                </div>
                <Select value={linkArgumentId} onValueChange={setLinkArgumentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an Argument to link" className="text-muted-foreground" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No link</SelectItem>
                    {existingNodes.filter(n => n.node_type === 'argument').map(node => (
                      <SelectItem key={node.id} value={node.id}>
                        <div>
                          <div className="font-medium">{node.title}</div>
                          <div className="text-xs text-muted-foreground capitalize">Argument</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkRecs.argument && (
                  <div className="mt-1 text-xs text-muted-foreground">Recommended: {linkRecs.argument.title} ({Math.round(linkRecs.argument.score * 100)}%)</div>
                )}
              </div>
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