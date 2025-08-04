import { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Controls,
  
  Background,
  Panel,
  NodeChange,
  EdgeChange,
  MarkerType,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './ibis-flow.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Plus, Search, Filter, MessageSquare, GitBranch } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface IbisNode {
  id: string;
  title: string;
  description?: string;
  node_type: 'issue' | 'position' | 'argument';
  parent_id?: string;
  position_x?: number;
  position_y?: number;
  message_id?: string;
  created_at: string;
  updated_at: string;
}

interface IbisRelationship {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: 'supports' | 'opposes' | 'relates_to' | 'responds_to';
  created_at: string;
  created_by: string;
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
}

interface IbisMapVisualizationProps {
  deliberationId: string;
}

const nodeTypeConfig = {
  issue: {
    color: '#ef4444',
    shape: 'circle',
    label: 'Issue'
  },
  position: {
    color: '#3b82f6',
    shape: 'rectangle',
    label: 'Position'
  },
  argument: {
    color: '#22c55e',
    shape: 'diamond',
    label: 'Argument'
  }
};

const relationshipConfig = {
  supports: { color: '#22c55e', style: 'solid', label: 'Supports' },
  opposes: { color: '#ef4444', style: 'dashed', label: 'Opposes' },
  relates_to: { color: '#8b5cf6', style: 'dotted', label: 'Relates to' },
  responds_to: { color: '#f59e0b', style: 'solid', label: 'Responds to' },
};

export const IbisMapVisualization = ({ deliberationId }: IbisMapVisualizationProps) => {
  const [ibisNodes, setIbisNodes] = useState<IbisNode[]>([]);
  const [ibisRelationships, setIbisRelationships] = useState<IbisRelationship[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedNode, setSelectedNode] = useState<IbisNode | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'issue' | 'position' | 'argument'>('all');
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionType, setConnectionType] = useState<'supports' | 'opposes' | 'relates_to' | 'responds_to'>('supports');
  const [newNodeData, setNewNodeData] = useState({
    title: '',
    description: '',
    node_type: 'issue' as 'issue' | 'position' | 'argument',
    parent_id: '',
  });
  const { toast } = useToast();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Handle node position changes and persist to database
  const handleNodesChange = useCallback(async (changes: NodeChange[]) => {
    onNodesChange(changes);
    
    // Find position changes and persist them
    const positionChanges = changes.filter(change => 
      change.type === 'position' && change.dragging === false
    );
    
    for (const change of positionChanges) {
      if (change.type === 'position' && change.position) {
        try {
          await supabase
            .from('ibis_nodes')
            .update({
              position_x: change.position.x,
              position_y: change.position.y,
              updated_at: new Date().toISOString(),
            })
            .eq('id', change.id);
        } catch (error) {
          console.error('Error updating node position:', error);
        }
      }
    }
  }, [onNodesChange]);

  // Handle new connections between nodes
  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to create connections",
          variant: "destructive",
        });
        return;
      }

      // Create relationship in database
      const { error } = await supabase
        .from('ibis_relationships')
        .insert({
          source_node_id: connection.source,
          target_node_id: connection.target,
          relationship_type: connectionType,
          deliberation_id: deliberationId,
          created_by: user.id,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `${relationshipConfig[connectionType].label} relationship created`,
      });

      // Refresh data to show new relationship
      fetchData();
    } catch (error) {
      console.error('Error creating relationship:', error);
      toast({
        title: "Error",
        description: "Failed to create relationship",
        variant: "destructive",
      });
    }
  }, [connectionType, deliberationId]);

  // Fetch IBIS nodes, relationships, and messages from Supabase
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch IBIS nodes
      const { data: nodesData, error: nodesError } = await supabase
        .from('ibis_nodes')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      if (nodesError) throw nodesError;
      
      // Fetch relationships
      const { data: relationshipsData, error: relationshipsError } = await supabase
        .from('ibis_relationships')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      if (relationshipsError) console.error('Relationships error:', relationshipsError);
      
      // Fetch messages for traceability
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('id, content, created_at, user_id')
        .eq('deliberation_id', deliberationId);

      if (messagesError) throw messagesError;

      setIbisNodes(nodesData || []);
      setIbisRelationships(relationshipsData || []);
      setMessages(messagesData || []);
      convertToFlowNodes(nodesData || [], relationshipsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load IBIS data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [deliberationId, toast]);

  // Cluster similar issues together using content similarity
  const clusterSimilarIssues = (nodes: IbisNode[]) => {
    const issues = nodes.filter(n => n.node_type === 'issue');
    const clusters: { [key: string]: IbisNode[] } = {};
    
    // Simple keyword-based clustering
    issues.forEach(issue => {
      const words = issue.title.toLowerCase().split(' ').filter(w => w.length > 3);
      const key = words.length > 0 ? words[0] : 'general';
      if (!clusters[key]) clusters[key] = [];
      clusters[key].push(issue);
    });
    
    return clusters;
  };
  // Convert IBIS nodes to React Flow nodes and edges with clustering and relationships
  const convertToFlowNodes = (ibisNodesData: IbisNode[], relationshipsData: IbisRelationship[] = []) => {
    // Apply filtering
    const filteredNodes = ibisNodesData.filter(node => {
      const matchesSearch = searchTerm === '' || 
        node.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (node.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || node.node_type === filterType;
      return matchesSearch && matchesType;
    });

    // Cluster similar issues
    const issueClusters = clusterSimilarIssues(filteredNodes);
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Position nodes with clustering
    let clusterY = 100;
    Object.entries(issueClusters).forEach(([clusterKey, clusterNodes]) => {
      clusterNodes.forEach((node, index) => {
        const position = {
          x: node.position_x || 100 + index * 180,
          y: node.position_y || clusterY
        };
        
        const flowNode = createFlowNode(node, position);
        flowNodes.push(flowNode);
      });
      clusterY += 200; // Space between clusters
    });

    // Add non-issue nodes
    filteredNodes
      .filter(node => node.node_type !== 'issue')
      .forEach((node, index) => {
        const position = {
          x: node.position_x || 600 + (index % 3) * 200,
          y: node.position_y || 100 + Math.floor(index / 3) * 150
        };
        
        const flowNode = createFlowNode(node, position);
        flowNodes.push(flowNode);
      });

    // Create parent-child edges (hierarchy)
    filteredNodes.forEach(node => {
      if (node.parent_id && filteredNodes.some(n => n.id === node.parent_id)) {
        flowEdges.push({
          id: `parent-${node.parent_id}-${node.id}`,
          source: node.parent_id,
          target: node.id,
          type: 'smoothstep',
          animated: false,
          style: { 
            stroke: '#94a3b8', 
            strokeWidth: 2,
            strokeDasharray: '3,3',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#94a3b8',
          },
          data: { type: 'hierarchy' },
        });
      }
    });

    // Create relationship edges (semantic connections)
    relationshipsData.forEach(relationship => {
      if (filteredNodes.some(n => n.id === relationship.source_node_id) && 
          filteredNodes.some(n => n.id === relationship.target_node_id)) {
        const config = relationshipConfig[relationship.relationship_type];
        
        flowEdges.push({
          id: `rel-${relationship.id}`,
          source: relationship.source_node_id,
          target: relationship.target_node_id,
          type: 'smoothstep',
          animated: relationship.relationship_type === 'supports',
          style: { 
            stroke: config.color, 
            strokeWidth: 3,
            strokeDasharray: config.style === 'dashed' ? '8,4' : 
                           config.style === 'dotted' ? '2,2' : 'none',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: config.color,
          },
          label: config.label,
          data: { 
            type: 'relationship',
            relationship: relationship 
          },
        });
      }
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // Helper function to create flow nodes
  const createFlowNode = (node: IbisNode, position: { x: number; y: number }): Node => {
    const config = nodeTypeConfig[node.node_type];
    
    return {
      id: node.id,
      type: 'default',
      position,
      data: {
        label: (
          <div className="text-center p-2 node-content">
            <div className={`font-semibold text-sm ${node.node_type === 'issue' ? 'text-white' : 'text-gray-800'}`}>
              {node.title}
            </div>
            <Badge variant="secondary" className="mt-1 text-xs">
              {config.label}
            </Badge>
            {node.message_id && (
              <MessageSquare className="h-3 w-3 mt-1 mx-auto opacity-60" />
            )}
          </div>
        ),
      },
      className: `ibis-node-${node.node_type}`,
      style: {
        backgroundColor: config.color,
        borderRadius: node.node_type === 'issue' ? '50%' : 
                      node.node_type === 'argument' ? '0' : '8px',
        border: '2px solid #fff',
        minWidth: node.node_type === 'issue' ? 120 : 140,
        minHeight: node.node_type === 'issue' ? 120 : 80,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      },
      draggable: true,
    };
  };
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const ibisNode = ibisNodes.find(n => n.id === node.id);
    setSelectedNode(ibisNode || null);
    
    // Find associated message if exists
    if (ibisNode?.message_id) {
      const message = messages.find(m => m.id === ibisNode.message_id);
      setSelectedMessage(message || null);
    } else {
      setSelectedMessage(null);
    }
  }, [ibisNodes, messages]);

  // Handle node click to show details and message traceability
  const handleCreateNode = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to create nodes",
          variant: "destructive",
        });
        return;
      }

      const newPosition = {
        x: Math.random() * 400 + 200,
        y: Math.random() * 300 + 100,
      };

      const { error } = await supabase
        .from('ibis_nodes')
        .insert({
          deliberation_id: deliberationId,
          title: newNodeData.title,
          description: newNodeData.description || null,
          node_type: newNodeData.node_type,
          parent_node_id: newNodeData.parent_id || null,
          position_x: newPosition.x,
          position_y: newPosition.y,
          created_by: user.id,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Node created successfully",
      });

      // Reset form and close modal
      setNewNodeData({
        title: '',
        description: '',
        node_type: 'issue',
        parent_id: '',
      });
      setIsCreatingNode(false);
      
      // Refresh data
      fetchData();
    } catch (error) {
      console.error('Error creating node:', error);
      toast({
        title: "Error",
        description: "Failed to create node",
        variant: "destructive",
      });
    }
  };

  // Update filtering when search term or filter type changes
  useEffect(() => {
    if (ibisNodes.length > 0) {
      convertToFlowNodes(ibisNodes, ibisRelationships);
    }
  }, [searchTerm, filterType, ibisNodes, ibisRelationships]);

  // Set up real-time subscription
  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('ibis_nodes_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ibis_nodes',
          filter: `deliberation_id=eq.${deliberationId}`,
        },
        (payload) => {
          console.log('IBIS nodes changed:', payload);
          fetchData(); // Refresh nodes on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deliberationId, fetchData]);

  const handleRefresh = () => {
    fetchData();
    toast({
      title: "Refreshed",
      description: "IBIS map has been refreshed",
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
          <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Main Flow Area */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          fitView
          attributionPosition="bottom-left"
          className="bg-background"
          nodesDraggable={true}
          nodesConnectable={isConnecting}
          elementsSelectable={true}
          connectionMode={ConnectionMode.Loose}
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          
          {/* Search, Filter, and Connection Panel */}
          <Panel position="top-left">
            <div className="bg-white p-3 rounded-lg shadow-md border space-y-2 w-80">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search nodes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="issue">Issues</SelectItem>
                    <SelectItem value="position">Positions</SelectItem>
                    <SelectItem value="argument">Arguments</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Connection Controls */}
              <div className="border-t pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant={isConnecting ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsConnecting(!isConnecting)}
                    className="flex-1"
                  >
                    {isConnecting ? 'Stop Connecting' : 'Connect Nodes'}
                  </Button>
                </div>
                
                {isConnecting && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      Select connection type, then drag from one node to another
                    </div>
                    <Select 
                      value={connectionType} 
                      onValueChange={(value: any) => setConnectionType(value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supports">Supports</SelectItem>
                        <SelectItem value="opposes">Opposes</SelectItem>
                        <SelectItem value="relates_to">Relates to</SelectItem>
                        <SelectItem value="responds_to">Responds to</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="flex-1"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
                
                <Dialog open={isCreatingNode} onOpenChange={setIsCreatingNode}>
                  <DialogTrigger asChild>
                    <Button variant="default" size="sm" className="flex-1">
                      <Plus className="h-3 w-3 mr-1" />
                      Add Node
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create New IBIS Node</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={newNodeData.title}
                          onChange={(e) => setNewNodeData(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Enter node title"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="node_type">Type</Label>
                        <Select 
                          value={newNodeData.node_type} 
                          onValueChange={(value: any) => setNewNodeData(prev => ({ ...prev, node_type: value }))}
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
                      
                      <div>
                        <Label htmlFor="parent_id">Parent Node (Optional)</Label>
                        <Select 
                          value={newNodeData.parent_id} 
                          onValueChange={(value) => setNewNodeData(prev => ({ ...prev, parent_id: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select parent node" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No parent</SelectItem>
                            {ibisNodes.map((node) => (
                              <SelectItem key={node.id} value={node.id}>
                                {node.title} ({nodeTypeConfig[node.node_type].label})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Textarea
                          id="description"
                          value={newNodeData.description}
                          onChange={(e) => setNewNodeData(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Enter node description"
                          rows={3}
                        />
                      </div>
                      
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsCreatingNode(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleCreateNode}
                          disabled={!newNodeData.title.trim()}
                        >
                          Create Node
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="w-80 border-l border-border bg-card">
          <Card className="h-full border-0 rounded-none">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: nodeTypeConfig[selectedNode.node_type].color }}
                  />
                  Node Details
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedNode(null);
                    setSelectedMessage(null);
                  }}
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-base mb-2">{selectedNode.title}</h3>
                <Badge variant="outline">
                  {nodeTypeConfig[selectedNode.node_type].label}
                </Badge>
              </div>
              
              {selectedNode.description && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Description</h4>
                  <p className="text-sm">{selectedNode.description}</p>
                </div>
              )}
              
              {selectedMessage && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" />
                    Source Message
                  </h4>
                  <div className="bg-muted p-3 rounded text-sm">
                    <p className="text-xs text-muted-foreground mb-1">
                      {new Date(selectedMessage.created_at).toLocaleString()}
                    </p>
                    <p>{selectedMessage.content}</p>
                  </div>
                </div>
              )}
              
              <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
                <div>Created: {new Date(selectedNode.created_at).toLocaleDateString()}</div>
                <div>Updated: {new Date(selectedNode.updated_at).toLocaleDateString()}</div>
                {selectedNode.position_x !== undefined && (
                  <div>Position: ({Math.round(selectedNode.position_x!)}, {Math.round(selectedNode.position_y!)})</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Enhanced Legend */}
      <Panel position="bottom-right">
        <Card className="w-64">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <GitBranch className="h-4 w-4" />
              Visualization Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div>
              <h4 className="text-xs font-semibold mb-2">Node Types</h4>
              {Object.entries(nodeTypeConfig).map(([type, config]) => (
                <div key={type} className="flex items-center gap-2 text-xs mb-1">
                  <div 
                    className="w-3 h-3 border border-white"
                    style={{ 
                      backgroundColor: config.color,
                      borderRadius: type === 'issue' ? '50%' : type === 'argument' ? '0' : '2px',
                    }}
                  />
                  <span>{config.label}</span>
                </div>
              ))}
            </div>
            
            <div>
              <h4 className="text-xs font-semibold mb-2">Relationships</h4>
              {Object.entries(relationshipConfig).map(([type, config]) => (
                <div key={type} className="flex items-center gap-2 text-xs mb-1">
                  <div 
                    className="w-4 h-0.5"
                    style={{ 
                      backgroundColor: config.color,
                      borderStyle: config.style === 'dashed' ? 'dashed' : 'solid',
                      borderTopWidth: config.style === 'dotted' ? '1px' : '0',
                    }}
                  />
                  <span>{config.label}</span>
                </div>
              ))}
            </div>
            
            <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
              <div>• Similar issues are clustered</div>
              <div>• Drag nodes to reposition</div>
              <div>• Use Connect mode to link nodes</div>
              <div>• Click nodes for details</div>
            </div>
          </CardContent>
        </Card>
      </Panel>
    </div>
  );
};