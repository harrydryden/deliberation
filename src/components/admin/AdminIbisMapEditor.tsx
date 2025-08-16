import { useEffect, useState, useCallback, useRef } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { calculateSemanticSimilarity, calculateRelationshipStrength, applyForceDirectedLayout, getNodeDimensions } from '../ibis/ibis-layout';
import { applyConcentricLayout, constrainToZone, type ConcentricZones } from '../ibis/zone-layout';
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
  console.log('🔍 IBIS Map Editor - Component initialized with props:', { deliberationId, deliberationTitle });
  const [ibisNodes, setIbisNodes] = useState<IbisNode[]>([]);
  const [ibisRelationships, setIbisRelationships] = useState<IbisRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingNode, setEditingNode] = useState<IbisNode | null>(null);
  const [editingEdge, setEditingEdge] = useState<IbisRelationship | null>(null);
  const [selectedEdgeType, setSelectedEdgeType] = useState<'supports' | 'opposes' | 'relates_to' | 'responds_to'>('relates_to');
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [zones, setZones] = useState<ConcentricZones | null>(null);
  
  // Custom node types
  const nodeTypes = {
    custom: CustomIbisNode,
  };
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  // Node editing form state
  const [nodeForm, setNodeForm] = useState({
    title: '',
    description: '',
    node_type: 'issue' as 'issue' | 'position' | 'argument'
  });

  // Edge editing form state
  const [edgeForm, setEdgeForm] = useState({
    relationship_type: 'relates_to' as 'supports' | 'opposes' | 'relates_to' | 'responds_to'
  });

  // Fetch data from Supabase
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      console.log('🔍 IBIS Map Editor - Starting data fetch for deliberation:', deliberationId);
      
      // Directly use the admin RPC functions for reliable data access
      console.log('🔍 Fetching IBIS nodes for deliberation:', deliberationId);
      
      // First try with RLS, then fallback to admin access if needed
      let nodesData, nodesError;
      
      try {
        const result = await supabase
          .from('ibis_nodes')
          .select('*')
          .eq('deliberation_id', deliberationId)
          .order('created_at', { ascending: true });
          
        nodesData = result.data;
        nodesError = result.error;
        
        // If we get empty results but no error, the user might not have proper access
        if (!nodesError && (!nodesData || nodesData.length === 0)) {
          console.log('🔍 Empty results from RLS query, checking if nodes exist with direct query...');
          
          // Use a more direct approach for admin access
          const directResult = await supabase.rpc('admin_get_ibis_nodes', {
            target_deliberation_id: deliberationId
          });
          
          if (directResult.error) {
            console.log('🔍 Direct RPC call failed, continuing with empty result');
          } else {
            console.log('🔍 Found nodes via direct query:', directResult.data?.length || 0);
            nodesData = directResult.data || [];
          }
        }
      } catch (error) {
        console.error('❌ Error in IBIS nodes query:', error);
        nodesError = error;
      }

      console.log('🔍 IBIS nodes query result:', { nodesData, nodesError });

      if (nodesError) {
        console.error('❌ Nodes error:', nodesError);
        throw nodesError;
      }
      
      // Fetch IBIS relationships with similar fallback approach
      console.log('🔍 Fetching IBIS relationships for deliberation:', deliberationId);
      
      let relationshipsData, relationshipsError;
      
      try {
        const result = await supabase
          .from('ibis_relationships')
          .select('*')
          .eq('deliberation_id', deliberationId)
          .order('created_at', { ascending: true });
          
        relationshipsData = result.data;
        relationshipsError = result.error;
        
        // If we get empty results but no error, use the admin RPC
        if (!relationshipsError && (!relationshipsData || relationshipsData.length === 0)) {
          console.log('🔍 Empty relationships from RLS query, trying direct query...');
          
          const directResult = await supabase.rpc('admin_get_ibis_relationships', {
            target_deliberation_id: deliberationId
          });
          
          if (directResult.error) {
            console.log('🔍 Direct RPC call for relationships failed, continuing with empty result');
          } else {
            console.log('🔍 Found relationships via direct query:', directResult.data?.length || 0);
            relationshipsData = directResult.data || [];
          }
        }
      } catch (error) {
        console.error('❌ Error in IBIS relationships query:', error);
        relationshipsError = error;
      }

      console.log('🔍 IBIS relationships query result:', { relationshipsData, relationshipsError });

      if (relationshipsError) {
        console.error('❌ Relationships error:', relationshipsError);
        logger.warn('Relationships error', relationshipsError as any);
      }

      console.log('🔍 IBIS Map Editor - Data loaded:', {
        totalNodes: nodesData?.length || 0,
        issues: nodesData?.filter(n => n.node_type === 'issue').length || 0,
        positions: nodesData?.filter(n => n.node_type === 'position').length || 0,
        arguments: nodesData?.filter(n => n.node_type === 'argument').length || 0,
        relationships: relationshipsData?.length || 0,
        deliberationId,
        sampleNode: nodesData?.[0]
      });

      logger.info('IBIS data loaded for editing', {
        totalNodes: nodesData?.length || 0,
        issues: nodesData?.filter(n => n.node_type === 'issue').length || 0,
        positions: nodesData?.filter(n => n.node_type === 'position').length || 0,
        arguments: nodesData?.filter(n => n.node_type === 'argument').length || 0,
        relationships: relationshipsData?.length || 0,
      });

      setIbisNodes(nodesData || []);
      setIbisRelationships(relationshipsData || []);

    } catch (error) {
      console.error('🚨 DETAILED ERROR in IBIS data fetch:', error);
      console.error('🚨 Error name:', error?.name);
      console.error('🚨 Error message:', error?.message);
      console.error('🚨 Error stack:', error?.stack);
      console.error('🚨 Full error object:', JSON.stringify(error, null, 2));
      
      logger.error('Error fetching IBIS data', error as any);
      toast({
        title: "Error",
        description: `Failed to load IBIS data: ${error?.message || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [deliberationId, toast]);

  // Convert IBIS data to React Flow format
  const convertToFlowNodes = useCallback(() => {
    console.log('🔍 IBIS Map Editor - Converting nodes:', { 
      ibisNodesCount: ibisNodes.length, 
      ibisRelationshipsCount: ibisRelationships.length,
      sampleNode: ibisNodes[0]
    });
    const canvas = { width: 1600, height: 1000 };
    
    // Use existing positions or compute layout
    const positionsMap = new Map<string, { x: number; y: number }>();
    
    // First, add existing positions
    ibisNodes.forEach(node => {
      if (node.position_x !== undefined && node.position_y !== undefined) {
        positionsMap.set(node.id, { x: node.position_x, y: node.position_y });
      }
    });
    
    // For nodes without positions, use layout algorithm
    const nodesWithoutPositions = ibisNodes.filter(node => 
      node.position_x === undefined || node.position_y === undefined
    );
    
    // ALWAYS apply concentric layout for zone enforcement
    console.log('🎯 Admin editor - Forcing concentric layout for ALL nodes');
    
    try {
      const { positions: layoutPositions, zones: layoutZones } = applyConcentricLayout(
        ibisNodes.map(n => ({
          id: n.id,
          title: n.title,
          node_type: n.node_type,
          position_x: null, // Force recalculation
          position_y: null,
          embedding: n.embedding || null,
          parent_id: n.parent_id,
          parent_node_id: undefined
        })),
        ibisRelationships.map(r => ({
          source_node_id: r.source_node_id,
          target_node_id: r.target_node_id,
          relationship_type: r.relationship_type
        })),
        canvas
      );
      
      console.log('🎯 Admin editor - Layout calculated:', {
        positionsCount: layoutPositions.size,
        zonesCalculated: !!layoutZones,
        zones: layoutZones
      });
      
      // Store zones for rendering
      if (layoutZones) {
        setZones(layoutZones);
        console.log('🎯 Admin editor - Zones set in state:', layoutZones);
      }
      
      // Apply new positions to ALL nodes 
      layoutPositions.forEach((pos, nodeId) => {
        positionsMap.set(nodeId, { x: pos.x, y: pos.y });
      });
      
      console.log('🎯 Admin editor - Concentric layout applied to ALL nodes:', {
        positionsMapSize: positionsMap.size,
        zonesSet: !!layoutZones,
        samplePosition: positionsMap.entries().next().value
      });
    } catch (error) {
      console.error('🚨 Error applying concentric layout:', error);
    }

    // Convert to React Flow nodes
    const flowNodes: Node[] = ibisNodes.map((node) => {
      const position = positionsMap.get(node.id) || { x: 0, y: 0 };
      const config = nodeTypeConfig[node.node_type];
      const importance = calculateNodeImportance(node.id, ibisRelationships);
      const scaleFactor = 1 + importance * 0.2;

      return {
        id: node.id,
        type: 'custom',
        position,
        data: {
          label: node.title.length > 30 ? `${node.title.substring(0, 30)}...` : node.title,
          originalNode: node,
          config,
          scaleFactor,
        },
        style: {
          width: 120 * scaleFactor,
          height: node.node_type === 'argument' ? 120 * scaleFactor : 80 * scaleFactor,
        },
        draggable: true,
        selectable: true,
        connectable: true,
      };
    });

    // Convert relationships to React Flow edges with optimal handle routing
    const flowEdges: Edge[] = ibisRelationships
      .filter(rel => {
        // Ensure the relationship has all required properties
        if (!rel || !rel.id || !rel.source_node_id || !rel.target_node_id || !rel.relationship_type) {
          console.warn('🔍 Filtering out invalid relationship:', rel);
          return false;
        }
        
        // Ensure both source and target nodes exist
        const sourceExists = flowNodes.some(node => node.id === rel.source_node_id);
        const targetExists = flowNodes.some(node => node.id === rel.target_node_id);
        
        if (!sourceExists || !targetExists) {
          console.warn('🔍 Filtering out relationship with missing nodes:', {
            relationshipId: rel.id,
            sourceExists,
            targetExists,
            sourceId: rel.source_node_id,
            targetId: rel.target_node_id
          });
          return false;
        }
        
        console.log('🔍 Including valid relationship:', { id: rel.id, type: rel.relationship_type });
        return true;
      })
      .map((rel) => {
      const config = relationshipConfig[rel.relationship_type] || relationshipConfig.relates_to;
      
      // Find source and target nodes to calculate optimal handles
      const sourceNode = flowNodes.find(n => n.id === rel.source_node_id);
      const targetNode = flowNodes.find(n => n.id === rel.target_node_id);
      
      let sourceHandle: string | undefined;
      let targetHandle: string | undefined;
      
      if (sourceNode && targetNode) {
        const sourceDimensions: NodeDimensions = {
          x: sourceNode.position.x,
          y: sourceNode.position.y,
          width: sourceNode.style?.width as number || 120,
          height: sourceNode.style?.height as number || 80,
        };
        
        const targetDimensions: NodeDimensions = {
          x: targetNode.position.x,
          y: targetNode.position.y,
          width: targetNode.style?.width as number || 120,
          height: targetNode.style?.height as number || 80,
        };
        
        const handles = calculateOptimalHandles(sourceDimensions, targetDimensions);
        sourceHandle = handles.sourceHandle;
        targetHandle = handles.targetHandle;
      }
      
      return {
        id: rel.id, // Use the relationship ID as the edge ID
        source: rel.source_node_id,
        target: rel.target_node_id,
        sourceHandle,
        targetHandle,
        type: 'default',
        style: {
          stroke: config.color,
          strokeWidth: 2,
          strokeDasharray: config.style === 'dashed' ? '5,5' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: config.color,
        },
        data: {
          relationshipId: rel.id, // Ensure we're storing the valid relationship ID
          relationshipType: rel.relationship_type, // Also store the type for reference
          label: config.label,
        },
        animated: false,
      };
    });

    console.log('🔍 IBIS Map Editor - Converted flow data:', {
      flowNodesCount: flowNodes.length,
      flowEdgesCount: flowEdges.length,
      ibisRelationshipsCount: ibisRelationships.length,
      sampleFlowNode: flowNodes[0],
      sampleFlowEdge: flowEdges[0],
      allRelationshipIds: ibisRelationships.map(r => r.id)
    });

    console.log('🔍 Setting new nodes and edges:', { 
      newNodesCount: flowNodes.length, 
      newEdgesCount: flowEdges.length 
    });
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [ibisNodes, ibisRelationships, setNodes, setEdges]);

  const calculateNodeImportance = (nodeId: string, relationships: IbisRelationship[]): number => {
    const connections = relationships.filter(
      rel => rel.source_node_id === nodeId || rel.target_node_id === nodeId
    );
    
    let importance = connections.length;
    connections.forEach(rel => {
      if (rel.relationship_type === 'supports' || rel.relationship_type === 'opposes') {
        importance += 0.5;
      }
    });
    
    return Math.min(importance / 5, 2);
  };

  // Recalculate edge routing based on current node positions
  const recalculateEdgeRouting = useCallback((currentNodes: Node[]) => {
    setEdges(currentEdges => 
      currentEdges.map(edge => {
        const sourceNode = currentNodes.find(n => n.id === edge.source);
        const targetNode = currentNodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode) {
          const sourceDimensions: NodeDimensions = {
            x: sourceNode.position.x,
            y: sourceNode.position.y,
            width: sourceNode.style?.width as number || 120,
            height: sourceNode.style?.height as number || 80,
          };
          
          const targetDimensions: NodeDimensions = {
            x: targetNode.position.x,
            y: targetNode.position.y,
            width: targetNode.style?.width as number || 120,
            height: targetNode.style?.height as number || 80,
          };
          
          const handles = calculateOptimalHandles(sourceDimensions, targetDimensions);
          
          return {
            ...edge,
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
          };
        }
        
        return edge;
      })
    );
  }, [setEdges]);

  // Handle node position changes with detailed logging
  const handleNodesChange = useCallback(async (changes: NodeChange[]) => {
    console.log('🔍 All node changes:', changes);
    
    // Log different types of changes
    changes.forEach(change => {
      if (change.type === 'position') {
        console.log('🔍 Position change:', change);
      } else if (change.type === 'select') {
        console.log('🔍 Select change:', change);
      }
    });
    
    onNodesChange(changes);
    
    const positionChanges = changes.filter(change => 
      change.type === 'position' && change.dragging === false
    );
    
    if (positionChanges.length > 0) {
      console.log('🔍 Position changes detected:', positionChanges);
      setHasUnsavedChanges(true);
      
      // Recalculate edge routing after position changes
      setTimeout(() => {
        setNodes(currentNodes => {
          recalculateEdgeRouting(currentNodes);
          return currentNodes;
        });
      }, 0);
    }
  }, [onNodesChange, recalculateEdgeRouting, setNodes]);

  // Handle edge changes
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    
    // Check if any edges were removed
    const removedEdges = changes.filter(change => change.type === 'remove');
    if (removedEdges.length > 0) {
      setHasUnsavedChanges(true);
    }
  }, [onEdgesChange]);

  // Handle new connections
  const handleConnect = useCallback(async (connection: Connection) => {
    console.log('🔍 Connection attempt:', connection);
    console.log('🔍 Current user from auth:', user);
    console.log('🔍 Selected edge type:', selectedEdgeType);
    
    if (!connection.source || !connection.target) return;

    try {
      // Use the custom auth system instead of Supabase auth
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to create relationships",
          variant: "destructive",
        });
        return;
      }

      // For admin users, use a fixed admin UUID that exists in the system
      // This is a workaround since the custom auth system doesn't integrate with Supabase RLS
      const adminUserId = '1754a99d-2308-4b9c-ad02-bf943018237d'; // Use a known admin user ID

      const newRelationship = {
        source_node_id: connection.source,
        target_node_id: connection.target,
        relationship_type: selectedEdgeType,
        deliberation_id: deliberationId,
        created_by: adminUserId, // Use fixed admin ID for RLS compatibility
      };

      console.log('🔍 Creating relationship:', newRelationship);

      // Use the admin RPC function to bypass RLS issues
      const { data, error } = await supabase.rpc('admin_create_ibis_relationship', {
        p_source_node_id: newRelationship.source_node_id,
        p_target_node_id: newRelationship.target_node_id,
        p_relationship_type: newRelationship.relationship_type,
        p_deliberation_id: newRelationship.deliberation_id,
        p_created_by: newRelationship.created_by
      });

      if (error) {
        console.error('Error creating relationship', { error });
        throw error;
      }

      console.log('🔍 Relationship created successfully:', data);

      // Add to local state - this will trigger convertDataToFlowElements
      const fullRelationship: IbisRelationship = {
        id: data.id,
        ...newRelationship,
        created_at: data.created_at,
      };

      console.log('🔍 Adding new relationship to local state:', fullRelationship);
      setIbisRelationships(prev => {
        // Filter out any undefined/invalid relationships first
        const cleanPrev = prev.filter(rel => rel && rel.id && rel.source_node_id && rel.target_node_id);
        console.log('🔍 State update - cleaned before:', cleanPrev.length, 'raw before:', prev.length);
        
        // Check if this relationship already exists
        const exists = cleanPrev.find(r => r.id === fullRelationship.id);
        if (exists) {
          console.log('🔍 Relationship already exists, not adding duplicate');
          return cleanPrev;
        }
        
        const updated = [...cleanPrev, fullRelationship];
        console.log('🔍 State update - after:', updated.length);
        console.log('🔍 New relationship verified in state:', updated.find(r => r.id === fullRelationship.id));
        console.log('🔍 All relationship IDs:', updated.map(r => r.id));
        
        return updated;
      });
      setHasUnsavedChanges(true);

      toast({
        title: "Connection Created",
        description: `New ${selectedEdgeType.replace('_', ' ')} relationship added between nodes`,
      });

    } catch (error) {
      logger.error('Error creating relationship', error as any);
      toast({
        title: "Error",
        description: "Failed to create relationship",
        variant: "destructive",
      });
    }
  }, [deliberationId, selectedEdgeType, user, toast]);

  // Handle node editing with proper click detection
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Only trigger edit if this was a click, not a drag
    const wasClick = !event.defaultPrevented;
    if (wasClick) {
      console.log('🔍 Node clicked for editing:', node.id);
      const ibisNode = node.data.originalNode as IbisNode;
      setEditingNode(ibisNode);
      setNodeForm({
        title: ibisNode.title,
        description: ibisNode.description || '',
        node_type: ibisNode.node_type,
      });
    }
  }, []);

  // Handle edge editing
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    console.log('🔍 Edge clicked for editing:', { 
      edgeId: edge.id, 
      edgeData: edge.data,
      relationshipId: edge.data?.relationshipId 
    });
    
    // Find the relationship using the relationshipId from edge data, not the edge ID
    const relationshipId = edge.data?.relationshipId || edge.id;
    const ibisRelationship = ibisRelationships.find(rel => rel.id === relationshipId);
    if (!ibisRelationship || !ibisRelationship.id) {
      console.error('🔍 Invalid relationship data - relationshipId:', relationshipId, 'available relationships:', ibisRelationships.map(r => r.id));
      toast({
        title: "Error",
        description: "Cannot edit relationship - relationship not found",
        variant: "destructive",
      });
      return;
    }
    
    console.log('🔍 Valid relationship found:', ibisRelationship);
    setEditingEdge(ibisRelationship);
    setEdgeForm({
      relationship_type: ibisRelationship.relationship_type,
    });
  }, [toast, ibisRelationships]);

  // Save node changes
  const handleSaveNode = async () => {
    if (!editingNode) return;

    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('ibis_nodes')
        .update({
          title: nodeForm.title,
          description: nodeForm.description,
          node_type: nodeForm.node_type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingNode.id);

      if (error) throw error;

      // Update local state
      setIbisNodes(prev => prev.map(node => 
        node.id === editingNode.id 
          ? { ...node, ...nodeForm, updated_at: new Date().toISOString() }
          : node
      ));

      setEditingNode(null);
      setHasUnsavedChanges(true);

      toast({
        title: "Node Updated",
        description: "Node changes saved successfully",
      });

    } catch (error) {
      logger.error('Error updating node', error as any);
      toast({
        title: "Error",
        description: "Failed to update node",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Save edge changes
  const handleSaveEdge = async () => {
    if (!editingEdge) return;

    try {
      setSaving(true);
      
      console.log('🔍 DEBUG: About to call admin_update_ibis_relationship with params:', {
        p_relationship_id: editingEdge.id,
        p_relationship_type: edgeForm.relationship_type,
        editingEdgeType: typeof editingEdge.id,
        editingEdgeId: editingEdge.id,
        editingEdge: editingEdge,
        edgeForm: edgeForm
      });

      // Ensure we have a valid relationship ID
      if (!editingEdge.id || typeof editingEdge.id !== 'string') {
        throw new Error(`Invalid relationship ID: ${editingEdge.id} (type: ${typeof editingEdge.id})`);
      }

      // Use the admin RPC function to bypass RLS issues
      const { data, error } = await supabase.rpc('admin_update_ibis_relationship', {
        p_relationship_id: editingEdge.id,
        p_relationship_type: edgeForm.relationship_type
      });

      console.log('🔍 DEBUG: RPC response:', { data, error });

      if (error) {
        console.error('🔍 DEBUG: Error details:', {
          error,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
          fullError: JSON.stringify(error, null, 2)
        });
        throw error;
      }

      console.log('🔍 Relationship updated successfully:', data);

      // Update local state
      setIbisRelationships(prev => prev.map(rel => 
        rel.id === editingEdge.id 
          ? { ...rel, relationship_type: edgeForm.relationship_type }
          : rel
      ));

      setEditingEdge(null);
      setHasUnsavedChanges(true);

      toast({
        title: "Relationship Updated",
        description: "Relationship type changed successfully",
      });

    } catch (error) {
      logger.error('Error updating relationship', error as any);
      toast({
        title: "Error",
        description: "Failed to update relationship",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete edge with immediate visual removal
  const handleDeleteEdge = async () => {
    if (!editingEdge) {
      console.error('🔍 No editing edge available for deletion');
      return;
    }

    if (!editingEdge.id || typeof editingEdge.id !== 'string') {
      console.error('🔍 Invalid edge ID for deletion:', editingEdge.id);
      toast({
        title: "Error",
        description: "Cannot delete - invalid edge data",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      
      console.log('🔍 Starting deletion process for relationship:', {
        id: editingEdge.id,
        type: editingEdge.relationship_type,
        source: editingEdge.source_node_id,
        target: editingEdge.target_node_id
      });
      
      // Immediately remove from visual map for instant feedback
      const relationshipToDelete = editingEdge;
      console.log('🔍 About to remove relationship from state:', relationshipToDelete.id);
      setIbisRelationships(prev => {
        const filtered = prev.filter(rel => rel.id !== relationshipToDelete.id);
        console.log('🔍 Immediate visual removal - relationships before:', prev.length, 'after:', filtered.length);
        console.log('🔍 Filtered out relationship:', relationshipToDelete.id);
        return filtered;
      });
      
      // Close dialog immediately for better UX
      setEditingEdge(null);
      
      // Try to delete from database using admin function first (more reliable)
      console.log('🔍 Attempting admin deletion first...');
      const { data: adminData, error: adminError } = await supabase.rpc('admin_delete_ibis_relationship', {
        p_relationship_id: relationshipToDelete.id
      });

      if (adminError || !adminData) {
        console.log('🔍 Admin deletion failed, trying direct deletion:', adminError);
        
        // Fallback to direct deletion
        const { error: directError } = await supabase
          .from('ibis_relationships')
          .delete()
          .eq('id', relationshipToDelete.id);

        if (directError) {
          console.error('🔍 Both admin and direct deletion failed:', { adminError, directError });
          // Restore the relationship if both attempts failed
          setIbisRelationships(prev => {
            console.log('🔍 Restoring relationship due to deletion failure');
            return [...prev, relationshipToDelete];
          });
          throw directError;
        }
        
        console.log('🔍 Direct deletion successful');
      } else {
        console.log('🔍 Admin deletion successful');
      }
      
      // Force a data refresh to ensure consistency
      console.log('🔍 Forcing data refresh after deletion...');
      
      // Wait a bit longer to ensure database changes are propagated
      setTimeout(async () => {
        try {
          console.log('🔍 Refreshing data after deletion...');
          await fetchData(); // Use the existing fetchData function instead of separate refresh
        } catch (refreshError) {
          console.error('🔍 Error refreshing data:', refreshError);
        }
      }, 1000); // Increased delay to ensure database consistency
      
      // Only show success toast after confirmed database deletion
      toast({
        title: "Edge Deleted",
        description: "Relationship successfully removed from database",
      });

    } catch (error) {
      console.error('🔍 Deletion process failed:', error);
      logger.error('Error deleting relationship', error as any);
      toast({
        title: "Deletion Failed", 
        description: `Could not delete relationship: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      // Reset saving state regardless of success/failure
      setSaving(false);
    }
  };

  // Save all position changes
  const handleSaveChanges = async () => {
    try {
      setSaving(true);
      
      // Save all node positions using admin RPC function
      const positionUpdates = nodes.map(node => {
        const ibisNode = node.data.originalNode as IbisNode;
        return supabase.rpc('admin_update_ibis_node_position', {
          p_node_id: ibisNode.id,
          p_position_x: node.position.x,
          p_position_y: node.position.y
        });
      });

      const results = await Promise.all(positionUpdates);
      
      // Check for any errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        console.error('🔍 Errors updating node positions:', errors);
        throw new Error('Failed to update some node positions');
      }

      console.log('🔍 Node positions updated successfully:', results.map(r => r.data));

      setHasUnsavedChanges(false);

      toast({
        title: "Changes Saved",
        description: "All changes have been saved successfully",
      });

    } catch (error) {
      logger.error('Error saving changes', error as any);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Load data on mount and when deliberationId changes
  useEffect(() => {
    console.log('🔍 IBIS Map Editor - useEffect triggered with deliberationId:', deliberationId);
    if (deliberationId) {
      console.log('🔍 IBIS Map Editor - About to call fetchData()');
      fetchData();
    } else {
      console.log('🔍 IBIS Map Editor - No deliberation ID, skipping fetchData()');
    }
  }, [deliberationId]); // Remove fetchData from dependencies to prevent unnecessary refetches

  // Convert data when it changes
  useEffect(() => {
    if (ibisNodes.length > 0 || ibisRelationships.length > 0) {
      convertToFlowNodes();
    }
  }, [ibisNodes, ibisRelationships, convertToFlowNodes]);


  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            Loading IBIS Map Editor...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
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
                onClick={handleSaveChanges} 
                disabled={!hasUnsavedChanges || saving}
                size="sm"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Map Editor or Empty State */}
      <div className="flex-1 relative">
        {ibisNodes.length === 0 ? (
          // Empty State
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
          // React Flow Map with Zone Backgrounds
          <div className="relative h-full">
            {/* Zone backgrounds */}
            {zones && (
              <div className="absolute inset-0 pointer-events-none z-0">
                <svg className="w-full h-full">
                  {/* Issue zone (center circle) */}
                  <circle
                    cx="50%"
                    cy="50%"
                    r={zones.issue.outerRadius}
                    fill={zones.issue.color}
                    stroke="hsl(var(--ibis-issue))"
                    strokeWidth="2"
                    strokeOpacity="0.3"
                    fillOpacity="0.15"
                  />
                  
                  {/* Position zone (middle ring) */}
                  <circle
                    cx="50%"
                    cy="50%"
                    r={zones.position.outerRadius}
                    fill={zones.position.color}
                    fillOpacity="0.08"
                    stroke="hsl(var(--ibis-position))"
                    strokeWidth="2"
                    strokeOpacity="0.25"
                    strokeDasharray="8,4"
                  />
                  <circle
                    cx="50%"
                    cy="50%"
                    r={zones.position.innerRadius}
                    fill="none"
                    stroke="hsl(var(--ibis-position))"
                    strokeWidth="1"
                    strokeOpacity="0.2"
                  />
                  
                  {/* Argument zone (outer ring) */}
                  <circle
                    cx="50%"
                    cy="50%"
                    r={zones.argument.outerRadius}
                    fill={zones.argument.color}
                    fillOpacity="0.08"
                    stroke="hsl(var(--ibis-argument))"
                    strokeWidth="2"
                    strokeOpacity="0.25"
                    strokeDasharray="12,6"
                  />
                  <circle
                    cx="50%"
                    cy="50%"
                    r={zones.argument.innerRadius}
                    fill="none"
                    stroke="hsl(var(--ibis-argument))"
                    strokeWidth="1"
                    strokeOpacity="0.2"
                  />
                  
                  {/* Zone labels */}
                  <text
                    x="50%"
                    y={`${50 - (zones.issue.outerRadius / 8)}%`}
                    textAnchor="middle"
                    className="fill-[hsl(var(--ibis-issue))]"
                    style={{ fontSize: '14px', fontWeight: 600, opacity: 0.7 }}
                  >
                    Issues
                  </text>
                  <text
                    x={`${50 + (zones.position.outerRadius / 16)}%`}
                    y="50%"
                    textAnchor="middle"
                    className="fill-[hsl(var(--ibis-position))]"
                    style={{ fontSize: '14px', fontWeight: 600, opacity: 0.7 }}
                  >
                    Positions
                  </text>
                  <text
                    x={`${50 + (zones.argument.outerRadius / 16)}%`}
                    y={`${50 + 3}%`}
                    textAnchor="middle"
                    className="fill-[hsl(var(--ibis-argument))]"
                    style={{ fontSize: '14px', fontWeight: 600, opacity: 0.7 }}
                  >
                    Arguments
                  </text>
                </svg>
              </div>
            )}
            
            
            <ReactFlow
              nodeTypes={nodeTypes}
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              className="admin-editor relative z-10"
              onNodeDragStart={(event, node) => {
                console.log('🔍 Node drag started:', node.id);
              }}
              onNodeDrag={(event, node) => {
                console.log('🔍 Node dragging:', node.id, node.position);
              }}
              onNodeDragStop={(event, node) => {
                console.log('🔍 Node drag stopped:', node.id, node.position);
              }}
              onConnectStart={(event, params) => {
                console.log('🔍 Connection start:', params);
              }}
              onConnectEnd={(event) => {
                console.log('🔍 Connection end:', event);
              }}
              connectionMode={ConnectionMode.Loose}
              fitView
              fitViewOptions={{ padding: 0.1 }}
              style={{ background: 'hsl(var(--background))' }}
              nodesDraggable={true}
              nodesConnectable={true}
              elementsSelectable={true}
              panOnDrag={true}
              defaultEdgeOptions={{
                type: 'smoothstep',
                animated: false,
              }}
            >
              {/* ZONE BACKGROUNDS - Fixed to map coordinates and properly centered */}
              <Panel position="top-left" className="pointer-events-none">
                <svg 
                  width="1600" 
                  height="1000"
                  viewBox="0 0 1600 1000"
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                    zIndex: 0
                  }}
                >
                  {/* Issues zone - center circle at proper map center */}
                  <circle 
                    cx="800" cy="400" r="120" 
                    fill="hsl(0 84% 95%)" fillOpacity="0.3" 
                    stroke="hsl(0 84% 60%)" strokeWidth="4" strokeOpacity="0.8" 
                  />
                  
                  {/* Positions zone - middle ring */}
                  <circle 
                    cx="800" cy="400" r="220" 
                    fill="hsl(217 91% 95%)" fillOpacity="0.2" 
                    stroke="hsl(217 91% 60%)" strokeWidth="4" strokeOpacity="0.7" 
                    strokeDasharray="12,6" 
                  />
                  <circle 
                    cx="800" cy="400" r="120" 
                    fill="none" 
                    stroke="hsl(217 91% 60%)" strokeWidth="2" strokeOpacity="0.5" 
                  />
                  
                  {/* Arguments zone - outer ring */}
                  <circle 
                    cx="800" cy="400" r="320" 
                    fill="hsl(142 71% 95%)" fillOpacity="0.2" 
                    stroke="hsl(142 71% 45%)" strokeWidth="4" strokeOpacity="0.7" 
                    strokeDasharray="18,9" 
                  />
                  <circle 
                    cx="800" cy="400" r="220" 
                    fill="none" 
                    stroke="hsl(142 71% 45%)" strokeWidth="2" strokeOpacity="0.5" 
                  />
                  
                  {/* Zone labels at map coordinates */}
                  <text x="800" y="300" textAnchor="middle" className="fill-[hsl(0_84%_60%)]" style={{ fontSize: '20px', fontWeight: 700 }}>ISSUES</text>
                  <text x="950" y="400" textAnchor="middle" className="fill-[hsl(217_91%_60%)]" style={{ fontSize: '20px', fontWeight: 700 }}>POSITIONS</text>
                  <text x="1050" y="450" textAnchor="middle" className="fill-[hsl(142_71%_45%)]" style={{ fontSize: '20px', fontWeight: 700 }}>ARGUMENTS</text>
                </svg>
              </Panel>
              
              <Background color="hsl(var(--ibis-grid))" gap={20} />
              <Controls />
            <Background />
            <Controls />
            
              {/* Control Panel */}
              <Panel position="top-left" className="space-y-2">
                <Card className="p-4" style={{ pointerEvents: 'auto' }}>
                  <h4 className="font-medium text-sm mb-2">New Connection Type</h4>
                  <Select value={selectedEdgeType} onValueChange={(value: any) => setSelectedEdgeType(value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supports">Supports</SelectItem>
                      <SelectItem value="opposes">Opposes</SelectItem>
                      <SelectItem value="relates_to">Relates to</SelectItem>
                      <SelectItem value="responds_to">Responds to</SelectItem>
                    </SelectContent>
                  </Select>
                  {zones && (
                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                      <div className="font-medium mb-1">Zone Layout Active</div>
                      <div>Issue R: {Math.round(zones.issue.outerRadius)}</div>
                      <div>Position R: {Math.round(zones.position.outerRadius)}</div>
                      <div>Argument R: {Math.round(zones.argument.outerRadius)}</div>
                    </div>
                  )}
                </Card>
              </Panel>

              {/* Legend */}
              <Panel position="top-right" className="space-y-2">
                <Card className="p-4">
                  <h3 className="font-semibold mb-2">Node Types</h3>
                  <div className="space-y-2 mb-4">
                    {Object.entries(nodeTypeConfig).map(([type, config]) => (
                      <div key={type} className="flex items-center gap-2 text-sm">
                        <div 
                          className="w-4 h-4 border border-gray-300"
                          style={{ 
                            backgroundColor: config.color,
                            borderRadius: type === 'issue' ? '50%' : type === 'argument' ? '0' : '2px'
                          }}
                        />
                        <span>{config.label}</span>
                      </div>
                    ))}
                  </div>
                  
                  <h3 className="font-semibold mb-2">Edge Types</h3>
                  <div className="space-y-2">
                    {Object.entries(relationshipConfig).map(([type, config]) => (
                      <div key={type} className="flex items-center gap-2 text-sm">
                        <div className="flex items-center">
                          <div 
                            className="w-6 h-0.5"
                            style={{ backgroundColor: config.color }}
                          />
                          <div 
                            className="w-0 h-0 border-l-4 border-t-2 border-b-2 border-transparent"
                            style={{ borderLeftColor: config.color }}
                          />
                        </div>
                        <span>{config.label}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </Panel>
            </ReactFlow>
          </div>
        )}
      </div>

      {/* Node Edit Dialog */}
      <Dialog open={!!editingNode} onOpenChange={() => setEditingNode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingNode?.node_type} Node</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={nodeForm.title}
                onChange={(e) => setNodeForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter node title"
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={nodeForm.description}
                onChange={(e) => setNodeForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter node description"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="node_type">Node Type</Label>
              <Select
                value={nodeForm.node_type}
                onValueChange={(value: 'issue' | 'position' | 'argument') => 
                  setNodeForm(prev => ({ ...prev, node_type: value }))
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNode(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNode} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edge Edit Dialog */}
      <Dialog open={!!editingEdge} onOpenChange={() => setEditingEdge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Relationship</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="relationship_type">Relationship Type</Label>
              <Select
                value={edgeForm.relationship_type}
                onValueChange={(value: 'supports' | 'opposes' | 'relates_to' | 'responds_to') => 
                  setEdgeForm(prev => ({ ...prev, relationship_type: value }))
                }
              >
                <SelectTrigger>
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
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingEdge(null)}>
              Cancel
            </Button>
            <div className="flex-1" />
            <Button onClick={handleSaveEdge} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteEdge} 
              disabled={saving}
              className="ml-2"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {saving ? 'Deleting...' : 'Delete Edge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};