import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, GitBranch, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { formatToUKDateTime } from '@/utils/timeUtils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';

interface IbisNode {
  id: string;
  title: string;
  description?: string;
  node_type: 'issue' | 'position' | 'argument';
  position_x: number;
  position_y: number;
  parent_node_id?: string;
  created_at: string;
  updated_at: string;
}

interface IbisNodeManagementProps {
  deliberationId: string;
  deliberationTitle: string;
  onBack: () => void;
}

export const IbisNodeManagement = ({ deliberationId, deliberationTitle, onBack }: IbisNodeManagementProps) => {
  logger.component.mount('IbisNodeManagement', { deliberationId, deliberationTitle });
  const [nodes, setNodes] = useState<IbisNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNode, setEditingNode] = useState<IbisNode | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    node_type: 'issue' | 'position' | 'argument';
    position_x: number;
    position_y: number;
  }>({
    title: '',
    description: '',
    node_type: 'issue',
    position_x: 0,
    position_y: 0
  });
  const { toast } = useToast();

  const fetchNodes = async () => {
    setLoading(true);
    try {
      // Use the admin function instead of direct table access to bypass RLS
      const { data, error } = await supabase.rpc('admin_get_ibis_nodes', {
        target_deliberation_id: deliberationId
      });
      
      if (error) throw error;
      setNodes(data || []);
    } catch (error) {
      logger.error('Error fetching IBIS nodes', error as Error);
      toast({
        title: "Error",
        description: "Failed to load IBIS nodes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, [deliberationId]);

  const handleEditNode = (node: IbisNode) => {
    setEditingNode(node);
    setEditForm({
      title: node.title,
      description: node.description || '',
      node_type: node.node_type,
      position_x: node.position_x,
      position_y: node.position_y
    });
  };

  const handleSaveNode = async () => {
    if (!editingNode) return;

    try {
      const { error } = await supabase
        .from('ibis_nodes')
        .update({
          title: editForm.title,
          description: editForm.description,
          node_type: editForm.node_type,
          position_x: editForm.position_x,
          position_y: editForm.position_y,
        })
        .eq('id', editingNode.id);

      if (error) throw error;

      // If title changed, recompute embedding for this node and link similar nodes of the same type
      const titleChanged = editingNode.title !== editForm.title;
      try {
        if (titleChanged) {
          await supabase.functions.invoke('ibis_embeddings', {
            body: { nodeId: editingNode.id, force: true, nodeType: editForm.node_type },
          });
        }
        // Link this node with similar ones in the same deliberation and type
        await supabase.functions.invoke('link_similar_ibis_issues', {
          body: { nodeId: editingNode.id, deliberationId, nodeType: editForm.node_type },
        });
      } catch (e) {
        logger.warn('Embedding/linking refresh failed', e as Error);
      }

      toast({
        title: "Success",
        description: "IBIS node updated successfully",
      });

      setEditingNode(null);
      fetchNodes();
    } catch (error) {
      logger.error('Error updating IBIS node', error as Error);
      toast({
        title: "Error",
        description: "Failed to update IBIS node",
        variant: "destructive",
      });
    }
  };

  const getNodeTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'issue': 'destructive',
      'position': 'default',
      'argument': 'secondary'
    };
    return <Badge variant={variants[type] || 'secondary'}>{type}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return formatToUKDateTime(dateString, 'dd MMM yyyy HH:mm');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            IBIS Nodes - {deliberationTitle}
          </CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={fetchNodes} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingSpinner />
        ) : nodes.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No IBIS nodes found for this deliberation</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {nodes.filter(n => n.node_type === 'issue').length}
                </div>
                <div className="text-sm text-muted-foreground">Issues</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {nodes.filter(n => n.node_type === 'position').length}
                </div>
                <div className="text-sm text-muted-foreground">Positions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {nodes.filter(n => n.node_type === 'argument').length}
                </div>
                <div className="text-sm text-muted-foreground">Arguments</div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium max-w-xs">
                      <div className="truncate">{node.title}</div>
                    </TableCell>
                    <TableCell>
                      {getNodeTypeBadge(node.node_type)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      ({Math.round(node.position_x)}, {Math.round(node.position_y)})
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="text-sm truncate">
                        {node.description || 'No description'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(node.created_at)}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditNode(node)}
                          >
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Edit IBIS Node</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium">Title</label>
                              <Input
                                value={editForm.title}
                                onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                                placeholder="Node title"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Type</label>
                              <Select
                                value={editForm.node_type}
                                onValueChange={(value: 'issue' | 'position' | 'argument') => 
                                  setEditForm({...editForm, node_type: value})
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="issue">Issue</SelectItem>
                                  <SelectItem value="position">Position</SelectItem>
                                  <SelectItem value="argument">Argument</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-sm font-medium">X Position</label>
                                <Input
                                  type="number"
                                  value={editForm.position_x}
                                  onChange={(e) => setEditForm({...editForm, position_x: parseFloat(e.target.value) || 0})}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium">Y Position</label>
                                <Input
                                  type="number"
                                  value={editForm.position_y}
                                  onChange={(e) => setEditForm({...editForm, position_y: parseFloat(e.target.value) || 0})}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium">Description</label>
                              <Textarea
                                value={editForm.description}
                                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                placeholder="Node description"
                                rows={3}
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setEditingNode(null)}>
                                Cancel
                              </Button>
                              <Button onClick={handleSaveNode}>
                                Save Changes
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};