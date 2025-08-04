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
  MiniMap,
  Background,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './ibis-flow.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Maximize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface IbisNode {
  id: string;
  title: string;
  description?: string;
  node_type: 'issue' | 'position' | 'argument';
  parent_id?: string;
  position?: { x: number; y: number };
  created_at: string;
  updated_at: string;
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

export const IbisMapVisualization = ({ deliberationId }: IbisMapVisualizationProps) => {
  const [ibisNodes, setIbisNodes] = useState<IbisNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<IbisNode | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Fetch IBIS nodes from Supabase
  const fetchIbisNodes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ibis_nodes')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setIbisNodes(data || []);
      convertToFlowNodes(data || []);
    } catch (error) {
      console.error('Error fetching IBIS nodes:', error);
      toast({
        title: "Error",
        description: "Failed to load IBIS nodes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [deliberationId, toast]);

  // Convert IBIS nodes to React Flow nodes and edges
  const convertToFlowNodes = (ibisNodesData: IbisNode[]) => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    ibisNodesData.forEach((node, index) => {
      const config = nodeTypeConfig[node.node_type];
      
      // Create node with custom styling based on type
      const flowNode: Node = {
        id: node.id,
        type: 'default',
        position: node.position || { 
          x: 200 + (index % 3) * 250, 
          y: 100 + Math.floor(index / 3) * 150 
        },
        data: {
          label: (
            <div className="text-center p-2">
              <div className={`font-semibold text-sm ${node.node_type === 'issue' ? 'text-white' : 'text-gray-800'}`}>
                {node.title}
              </div>
              <Badge variant="secondary" className="mt-1 text-xs">
                {config.label}
              </Badge>
            </div>
          ),
        },
        style: {
          backgroundColor: config.color,
          borderRadius: node.node_type === 'issue' ? '50%' : 
                        node.node_type === 'argument' ? '0' : '8px',
          border: '2px solid #fff',
          minWidth: node.node_type === 'issue' ? 120 : 140,
          minHeight: node.node_type === 'issue' ? 120 : 80,
          transform: node.node_type === 'argument' ? 'rotate(45deg)' : 'none',
        },
      };

      flowNodes.push(flowNode);

      // Create edge if node has a parent
      if (node.parent_id) {
        flowEdges.push({
          id: `${node.parent_id}-${node.id}`,
          source: node.parent_id,
          target: node.id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#64748b', strokeWidth: 2 },
        });
      }
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // Handle node click to show details
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const ibisNode = ibisNodes.find(n => n.id === node.id);
    setSelectedNode(ibisNode || null);
  }, [ibisNodes]);

  // Set up real-time subscription
  useEffect(() => {
    fetchIbisNodes();

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
          fetchIbisNodes(); // Refresh nodes on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deliberationId, fetchIbisNodes]);

  const handleRefresh = () => {
    fetchIbisNodes();
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
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          fitView
          attributionPosition="bottom-left"
          className="bg-background"
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap 
            nodeColor={(node) => {
              const ibisNode = ibisNodes.find(n => n.id === node.id);
              return ibisNode ? nodeTypeConfig[ibisNode.node_type].color : '#64748b';
            }}
            position="top-right"
          />
          <Panel position="top-left">
            <div className="bg-white p-2 rounded-lg shadow-md border">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
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
                  onClick={() => setSelectedNode(null)}
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
              
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Created: {new Date(selectedNode.created_at).toLocaleDateString()}</div>
                <div>Updated: {new Date(selectedNode.updated_at).toLocaleDateString()}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Legend */}
      <Panel position="bottom-right">
        <Card className="w-48">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Node Types</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {Object.entries(nodeTypeConfig).map(([type, config]) => (
              <div key={type} className="flex items-center gap-2 text-xs">
                <div 
                  className="w-3 h-3 border border-white"
                  style={{ 
                    backgroundColor: config.color,
                    borderRadius: type === 'issue' ? '50%' : type === 'argument' ? '0' : '2px',
                    transform: type === 'argument' ? 'rotate(45deg)' : 'none'
                  }}
                />
                <span>{config.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </Panel>
    </div>
  );
};