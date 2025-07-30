import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: messageContent,
    nodeType: '' as NodeType | '',
    parentNodeId: ''
  });

  const [existingNodes, setExistingNodes] = useState<Array<{
    id: string;
    title: string;
    node_type: string;
  }>>([]);

  // Load existing nodes when modal opens
  useEffect(() => {
    if (isOpen) {
      loadExistingNodes();
    }
  }, [isOpen, deliberationId]);

  const loadExistingNodes = async () => {
    try {
      const { data, error } = await supabase
        .from('ibis_nodes')
        .select('id, title, node_type')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExistingNodes(data || []);
    } catch (error) {
      console.error('Error loading existing nodes:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.nodeType) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please provide a title and select a node type",
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

      const { error: nodeError } = await supabase
        .from('ibis_nodes')
        .insert({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          node_type: formData.nodeType,
          parent_node_id: formData.parentNodeId && formData.parentNodeId !== 'none' ? formData.parentNodeId : null,
          deliberation_id: deliberationId,
          message_id: messageId,
          created_by: user.id, // This was missing!
          position_x: Math.random() * 800 + 100, // Random initial position
          position_y: Math.random() * 600 + 100
        });

      if (nodeError) throw nodeError;

      // Mark message as submitted to IBIS
      const { error: messageError } = await supabase
        .from('messages')
        .update({ submitted_to_ibis: true })
        .eq('id', messageId);

      if (messageError) throw messageError;

      toast({
        title: "Success",
        description: "Message successfully submitted to IBIS",
      });

      onSuccess?.();
      onClose();
      
      // Reset form
      setFormData({
        title: '',
        description: messageContent,
        nodeType: '',
        parentNodeId: ''
      });

    } catch (error: any) {
      console.error('Error submitting to IBIS:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit message to IBIS",
      });
    } finally {
      setIsSubmitting(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Message to IBIS</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nodeType">Node Type</Label>
            <Select 
              value={formData.nodeType} 
              onValueChange={(value: NodeType) => setFormData(prev => ({ ...prev, nodeType: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select IBIS node type" />
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
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter a concise title for this IBIS node"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Detailed description (optional)"
              rows={3}
            />
          </div>

          {existingNodes.length > 0 && (
            <div>
              <Label htmlFor="parentNode">Link to Parent Node (Optional)</Label>
              <Select 
                value={formData.parentNodeId} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, parentNodeId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a parent node to link to" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent (root node)</SelectItem>
                  {existingNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      <div>
                        <div className="font-medium">{node.title}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {node.node_type}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit to IBIS'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};