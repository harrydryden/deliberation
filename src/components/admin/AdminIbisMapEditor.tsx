import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  ReactFlowInstance,
  OnConnectStartParams,
  Handle,
  Position,
  useReactFlow,
  Viewport,
} from '@xyflow/react';
import { calculateOptimalHandles, NodeDimensions } from '@/utils/edgeRouting';
import '@xyflow/react/dist/style.css';
import '../ibis/ibis-flow.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, X, Plus, Trash2, Edit3, Move, Link, Unlink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { calculateSemanticSimilarity, calculateRelationshipStrength, applyForceDirectedLayout, getNodeDimensions } from '../ibis/ibis-layout';
import { applyConcentricLayout, constrainToZone, type ConcentricZones } from '../ibis/zone-layout';
import { ZoneVisualization } from './ZoneVisualization';
import CustomIbisNode from './CustomIbisNode';
import { logger } from '@/utils/logger';

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
  embedding?: number[];
}

interface IbisRelationship {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: 'supports' | 'opposes' | 'relates_to' | 'responds_to';
  created_at: string;
  created_by: string;
}

interface AdminIbisMapEditorProps {
  deliberationId: string;
  deliberationTitle: string;
  onBack: () => void;
}

const nodeTypeConfig = {
  issue: {
    color: 'hsl(var(--ibis-issue))',
    shape: 'circle',
    label: 'Issue'
  },
  position: {
    color: 'hsl(var(--ibis-position))',
    shape: 'rectangle',
    label: 'Position'
  },
  argument: {
    color: 'hsl(var(--ibis-argument))',
    shape: 'diamond',
    label: 'Argument'
  }
};

const relationshipConfig = {
  supports: { color: '#14B8A6', style: 'solid', label: 'Supports' },
  opposes: { color: '#FFA500', style: 'solid', label: 'Opposes' },
  relates_to: { color: 'hsl(var(--ibis-rel-relates))', style: 'solid', label: 'Relates to' },
  responds_to: { color: '#374151', style: 'solid', label: 'Responds to' },
};

export const AdminIbisMapEditor = ({ deliberationId, deliberationTitle, onBack }: AdminIbisMapEditorProps) => {
  logger.component.mount('AdminIbisMapEditor', { deliberationId, deliberationTitle });
  
  // Simplified state management to prevent re-render loops
  const [ibisNodes, setIbisNodes] = useState<IbisNode[]>([]);
  const [ibisRelationships, setIbisRelationships] = useState<IbisRelationship[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingNode, setEditingNode] = useState<IbisNode | null>(null);
  const [editingEdge, setEditingEdge] = useState<IbisRelationship | null>(null);
  const [selectedEdgeType, setSelectedEdgeType] = useState<'supports' | 'opposes' | 'relates_to' | 'responds_to'>('relates_to');
  
  const { toast } = useToast();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Zone configuration for constraint enforcement
  const zoneConfig = useMemo(() => ({
    issue: { innerRadius: 0, outerRadius: 150, centerX: 0, centerY: 0 },
    position: { innerRadius: 150, outerRadius: 300, centerX: 0, centerY: 0 },
    argument: { innerRadius: 300, outerRadius: 450, centerX: 0, centerY: 0 }
  }), []);
  
  // Calculate optimal handle positions for edge routing
  const calculateOptimalEdgeHandles = useCallback((sourceId: string, targetId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceId);
    const targetNode = nodes.find(n => n.id === targetId);
    
    if (!sourceNode || !targetNode) {
      return { sourceHandle: 'right', targetHandle: 'left-target' };
    }
    
    const sourceDimensions: NodeDimensions = {
      x: sourceNode.position.x,
      y: sourceNode.position.y,
      width: 60, // Based on our CustomIbisNode dimensions
      height: 40
    };
    
    const targetDimensions: NodeDimensions = {
      x: targetNode.position.x,
      y: targetNode.position.y,
      width: 60,
      height: 40
    };
    
    return calculateOptimalHandles(sourceDimensions, targetDimensions);
  }, [nodes]);
  
  // Constrain node center position to its appropriate zone with both inner and outer radius enforcement
  const constrainNodeToZone = useCallback((nodeId: string, position: { x: number; y: number }) => {
    const node = ibisNodes.find(n => n.id === nodeId);
    if (!node) return position;
    
    const nodeType = node.node_type;
    const zone = zoneConfig[nodeType];
    
    // Calculate distance from center (center position of the node)
    const distance = Math.sqrt(position.x * position.x + position.y * position.y);
    const angle = Math.atan2(position.y, position.x);
    
    // Check if the center position is outside the allowed zone boundaries
    // For issue nodes: center must be within 0 to outerRadius
    // For position nodes: center must be within innerRadius to outerRadius  
    // For argument nodes: center must be within innerRadius to outerRadius
    
    // If center is outside the outer radius, constrain to outer boundary
    if (distance > zone.outerRadius) {
      return {
        x: Math.cos(angle) * zone.outerRadius,
        y: Math.sin(angle) * zone.outerRadius
      };
    }
    
    // If center is inside the inner radius (only applies to position and argument zones), constrain to inner boundary
    if (distance < zone.innerRadius) {
      return {
        x: Math.cos(angle) * zone.innerRadius,
        y: Math.sin(angle) * zone.innerRadius
      };
    }
    
    return position;
  }, [ibisNodes, zoneConfig]);
  
  // Handle node position changes with zone enforcement and save to database
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Apply zone constraints to position changes
    const constrainedChanges = changes.map(change => {
      if (change.type === 'position' && change.position && !change.dragging) {
        const constrainedPosition = constrainNodeToZone(change.id, change.position);
        return {
          ...change,
          position: constrainedPosition
        };
      }
      return change;
    });
    
    onNodesChange(constrainedChanges);
    
    // Save position changes to database
    const positionChanges = constrainedChanges.filter(change => 
      change.type === 'position' && change.position && !change.dragging
    );
    
    if (positionChanges.length > 0) {
      setHasUnsavedChanges(true);
      
      // Debounced save to database
      setTimeout(async () => {
        for (const change of positionChanges) {
          if (change.type === 'position' && change.position) {
            try {
              await supabase.rpc('admin_update_ibis_node_position', {
                p_node_id: change.id,
                p_position_x: change.position.x,
                p_position_y: change.position.y
              });
            } catch (error) {
              logger.error('Failed to save node position', error as Error);
              toast({
                title: "Error",
                description: "Failed to save node position",
                variant: "destructive",
              });
            }
          }
        }
      }, 1000);
    }
  }, [onNodesChange, constrainNodeToZone, toast]);
  
  // ReactFlow instance ref
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  
  const nodeTypes = useMemo(() => ({
    custom: CustomIbisNode,
  }), []);

  // Enhanced edge deletion with proper temp ID handling
  const handleEdgeDelete = useCallback(async (edgeId: string) => {
    logger.debug('Deleting edge', { edgeId });
    
    // Check if this is a temporary ID
    if (edgeId.startsWith('temp_')) {
      logger.debug('Removing temporary edge from local state', { edgeId });
      setIbisRelationships(current => 
        current.filter(rel => rel.id !== edgeId)
      );
      toast({
        title: "Edge Removed",
        description: "Temporary edge connection removed",
      });
      return;
    }

    try {
      setSaving(true);
      
      const { data, error } = await supabase.rpc('admin_delete_ibis_relationship', {
        p_relationship_id: edgeId
      });

      if (error) throw error;

      // Remove from local state
      setIbisRelationships(current => 
        current.filter(rel => rel.id !== edgeId)
      );

      setHasUnsavedChanges(true);
      toast({
        title: "Edge Deleted",
        description: "Relationship removed successfully",
      });

    } catch (error) {
      logger.error('Error deleting edge', error as Error, { edgeId });
      toast({
        title: "Error",
        description: "Failed to delete relationship.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [toast]);

  // Handle edge changes with proper deletion support
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    logger.debug('Edge changes detected', { changes });
    
    // Handle edge removal
    const removedEdges = changes.filter(change => change.type === 'remove');
    removedEdges.forEach(change => {
      const edgeId = change.id;
      logger.debug('Edge removed via change', { edgeId });
      handleEdgeDelete(edgeId);
    });
    
    // Apply other changes normally
    onEdgesChange(changes);
    
    if (removedEdges.length > 0) {
      setHasUnsavedChanges(true);
    }
  }, [onEdgesChange, handleEdgeDelete]);

  // Handle new connections with optimal handle routing
  const handleConnect = useCallback(async (connection: Connection) => {
    logger.debug('Connection attempt', { connection });
    
    if (!connection.source || !connection.target) return;

    // Calculate optimal handles for the connection
    const optimalHandles = calculateOptimalEdgeHandles(connection.source, connection.target);
    
    // Override the connection handles with optimal ones
    const optimizedConnection = {
      ...connection,
      sourceHandle: optimalHandles.sourceHandle,
      targetHandle: optimalHandles.targetHandle
    };

    const adminUserId = '1754a99d-2308-4b9c-ad02-bf943018237d';
    const tempId = `temp_${Date.now()}`;

    const newRelationship = {
      source_node_id: optimizedConnection.source,
      target_node_id: optimizedConnection.target,
      relationship_type: selectedEdgeType,
      deliberation_id: deliberationId,
      created_by: adminUserId,
    };

    try {
      // Optimistically add temporary relationship
      const tempRelationship: IbisRelationship = {
        id: tempId,
        ...newRelationship,
        created_at: new Date().toISOString(),
      };
      
      setIbisRelationships(prev => [...prev, tempRelationship]);

      // Create real relationship in database
      const { data, error } = await supabase.rpc('admin_create_ibis_relationship', {
        p_source_node_id: newRelationship.source_node_id,
        p_target_node_id: newRelationship.target_node_id,
        p_relationship_type: newRelationship.relationship_type,
        p_deliberation_id: newRelationship.deliberation_id,
        p_created_by: newRelationship.created_by
      });

      if (error) throw error;

      const relationshipData = Array.isArray(data) ? data[0] : data;
      const realRelationship = {
        id: relationshipData.id,
        ...newRelationship,
        created_at: relationshipData.created_at,
      };

      // Replace temporary relationship with real one
      setIbisRelationships(current => 
        current.map(rel => 
          rel.id === tempId ? realRelationship : rel
        )
      );

      setHasUnsavedChanges(true);

      toast({
        title: "Connection Created",
        description: `New ${selectedEdgeType.replace('_', ' ')} relationship added with optimal routing`,
      });

    } catch (error) {
      // Remove temporary relationship on error
      setIbisRelationships(current => 
        current.filter(rel => rel.id !== tempId)
      );
      
      logger.error('Error creating relationship', error as any);
      toast({
        title: "Error",
        description: "Failed to create relationship.",
        variant: "destructive",
      });
    }
  }, [deliberationId, selectedEdgeType, toast, calculateOptimalEdgeHandles]);

  // Save all changes to database
  const saveChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    
    try {
      setSaving(true);
      
      // Save all node positions
      await Promise.all(
        ibisNodes.map(async (node) => {
          if (node.position_x !== undefined && node.position_y !== undefined) {
            return supabase.rpc('admin_update_ibis_node_position', {
              p_node_id: node.id,
              p_position_x: node.position_x,
              p_position_y: node.position_y
            });
          }
        })
      );
      
      setHasUnsavedChanges(false);
      
      toast({
        title: "Success",
        description: "All changes saved successfully",
      });
      
    } catch (error) {
      logger.error('Error saving changes', error as Error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [hasUnsavedChanges, ibisNodes, toast]);

  // Fetch data from Supabase
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch nodes
      const { data: nodesData, error: nodesError } = await supabase.rpc('admin_get_ibis_nodes', {
        target_deliberation_id: deliberationId
      });

      if (nodesError) throw nodesError;

      // Fetch relationships  
      const { data: relationshipsData, error: relationshipsError } = await supabase.rpc('admin_get_ibis_relationships', {
        target_deliberation_id: deliberationId
      });

      if (relationshipsError) throw relationshipsError;

      setIbisNodes(nodesData || []);
      setIbisRelationships(relationshipsData || []);

    } catch (error) {
      logger.error('Error fetching IBIS data', error as Error);
      toast({
        title: "Error",
        description: `Failed to load IBIS data: ${(error as Error)?.message || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [deliberationId, toast]);

  // Load data on mount - memoized to prevent re-fetch loops
  useEffect(() => {
    if (deliberationId) {
      fetchData();
    }
  }, [deliberationId]);

  // Convert data to React Flow format with optimal edge routing
  const { flowNodes, flowEdges } = useMemo(() => {
    const flowNodes: Node[] = ibisNodes.map(node => ({
      id: node.id,
      type: 'custom',
      position: { x: node.position_x || 0, y: node.position_y || 0 },
      data: { 
        originalNode: node,
        label: node.title,
        config: nodeTypeConfig[node.node_type],
        scaleFactor: 1
      },
      draggable: true,
      selectable: true,
      connectable: true,
    }));

    const flowEdges: Edge[] = ibisRelationships.map(rel => {
      // Calculate optimal handles for each existing edge
      const optimalHandles = calculateOptimalEdgeHandles(rel.source_node_id, rel.target_node_id);
      
      return {
        id: rel.id,
        source: rel.source_node_id,
        target: rel.target_node_id,
        sourceHandle: optimalHandles.sourceHandle,
        targetHandle: optimalHandles.targetHandle,
        type: 'smoothstep',
        style: { 
          stroke: relationshipConfig[rel.relationship_type]?.color || '#374151',
          strokeWidth: 2,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { relationshipType: rel.relationship_type },
      };
    });

    return { flowNodes, flowEdges };
  }, [ibisNodes, ibisRelationships, calculateOptimalEdgeHandles]);

  // Update nodes and edges when data changes
  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading IBIS map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <Card className="rounded-b-none border-b-0">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Edit IBIS Map: {deliberationTitle}
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <Badge variant="secondary" className="text-orange-600">
                  Unsaved Changes
                </Badge>
              )}
              <Button 
                onClick={saveChanges}
                disabled={!hasUnsavedChanges || saving}
                size="sm"
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Map Editor */}
      <div className="flex-1 relative">
        {ibisNodes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Card className="max-w-md text-center">
              <CardHeader>
                <CardTitle>No IBIS Nodes Found</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  This deliberation doesn't have any IBIS nodes yet. IBIS nodes need to be created from the main deliberation interface.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="relative h-full">
            <ReactFlow
              nodeTypes={nodeTypes}
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              className="admin-editor"
              connectionMode={ConnectionMode.Loose}
              connectOnClick={false}
              fitView
              nodesDraggable={true}
              nodesConnectable={true}
              elementsSelectable={true}
              selectNodesOnDrag={false}
              snapToGrid={false}
              snapGrid={[10, 10]}
            >
              <Controls />
              <Background />
              
              {/* Enhanced Zone visualization */}
              <ZoneVisualization zones={zoneConfig} />
              
              {/* Connection Type Panel */}
              <Panel position="top-left" className="bg-background border rounded-lg p-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Connection Type</Label>
                  <Select value={selectedEdgeType} onValueChange={(value: any) => setSelectedEdgeType(value)}>
                    <SelectTrigger className="w-[200px]">
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
              </Panel>

              {/* Enhanced Legend Panel with zone information */}
              <Panel position="bottom-right" className="bg-background border rounded-lg p-4">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Node Types & Zones</h4>
                  <div className="space-y-2">
                    {Object.entries(nodeTypeConfig).map(([type, config]) => {
                      const zone = zoneConfig[type as keyof typeof zoneConfig];
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <div 
                              className="w-3 h-3 rounded-sm border"
                              style={{ backgroundColor: config.color }}
                            />
                            <span className="capitalize font-medium">{config.label}</span>
                          </div>
                          <div className="text-xs text-muted-foreground ml-5">
                            Zone: {zone.innerRadius}-{zone.outerRadius}px
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <h4 className="font-medium text-sm mt-4">Relationships</h4>
                  <div className="space-y-2">
                    {Object.entries(relationshipConfig).map(([type, config]) => (
                      <div key={type} className="flex items-center gap-2 text-xs">
                        <div 
                          className="w-4 h-0.5"
                          style={{ backgroundColor: config.color }}
                        />
                        <span>{config.label}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="pt-2 mt-2 border-t text-xs text-muted-foreground">
                    <div>• Drag nodes within their designated zones</div>
                    <div>• Edges auto-route to shortest path</div>
                    <div>• Smaller handles for cleaner appearance</div>
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          </div>
        )}
      </div>
    </div>
  );
};
