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
  getBezierPath,
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
import { RefreshCw, Plus, Search, Filter, MessageSquare, GitBranch, ArrowRightLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { calculateSemanticSimilarity, calculateRelationshipStrength, applyForceDirectedLayout, getNodeDimensions } from './ibis-layout';
// Legacy import removed - using header-based auth
import { resolveCollisions, findNonOverlappingPosition } from './collision-detection';
import { applyConcentricLayout, constrainToZone, type ConcentricZones } from './zone-layout';
import { logger } from '@/utils/logger';
import { useSimplifiedPerformance, useSimplifiedMemo } from '@/hooks/useOptimizedState';

interface IbisNode {
  id: string;
  title: string;
  description?: string;
  node_type: 'issue' | 'position' | 'argument' | 'uncategorized';
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
  },
  uncategorized: {
    color: 'hsl(var(--muted-foreground))',
    shape: 'hexagon',
    label: 'Uncategorized'
  }
};

const relationshipConfig = {
  supports: { color: '#22c55e', style: 'solid', label: 'Supports' }, // green-500
  opposes: { color: '#ef4444', style: 'solid', label: 'Opposes' }, // red-500
  relates_to: { color: '#8b5cf6', style: 'solid', label: 'Relates to' }, // violet-500
  responds_to: { color: '#f59e0b', style: 'solid', label: 'Responds to' }, // amber-500
};

export const IbisMapVisualization = ({ deliberationId }: IbisMapVisualizationProps) => {
  const [ibisNodes, setIbisNodes] = useState<IbisNode[]>([]);
  const [ibisRelationships, setIbisRelationships] = useState<IbisRelationship[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [deliberationTitle, setDeliberationTitle] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<IbisNode | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
const [filterType, setFilterType] = useState<'all' | 'issue' | 'position' | 'argument' | 'uncategorized'>('all');
const { toast } = useToast();
const { user, isAdmin } = useSupabaseAuth();
  
  const [isGuideCollapsed, setIsGuideCollapsed] = useState(true);
  const [isOptimizingLayout, setIsOptimizingLayout] = useState(true);
  const hasFocusedOnLoad = useRef(false);
  
  // Check if user is admin

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const [computedPositions, setComputedPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [embeddingBackfillTriggered, setEmbeddingBackfillTriggered] = useState(false);
  const [zones, setZones] = useState<ConcentricZones | null>(null);
  const lastConversionSigRef = useRef<string | null>(null);
  const linkingTriggeredRef = useRef(false);

  // Connection handler
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Handle node position changes and persist to database (admin only)
  const handleNodesChange = useCallback(async (changes: NodeChange[]) => {
    // Only allow position changes for admins
    if (!isAdmin) {
      // For non-admins, filter out position changes but allow other changes like selection
      const filteredChanges = changes.filter(change => change.type !== 'position');
      onNodesChange(filteredChanges);
      
      // Show warning if user tried to move a node
      const hasPositionChanges = changes.some(change => change.type === 'position');
      if (hasPositionChanges) {
        toast({
          title: "Access Restricted",
          description: "Only administrators can move nodes",
          variant: "destructive",
        });
      }
      return;
    }
    
    onNodesChange(changes);
    
    // Find position changes and persist them (admin only)
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
              updated_at: new Date().toISOString()
            })
            .eq('id', change.id);
        } catch (error) {
          logger.error('Error updating node position', error as any);
        }
      }
    }
  }, [onNodesChange, isAdmin, toast]);

  // Fetch IBIS nodes, relationships, and messages from Supabase
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setIsOptimizingLayout(true);
      
      // Fetch deliberation title
      const { data: deliberationData, error: deliberationError } = await supabase
        .from('deliberations')
        .select('title')
        .eq('id', deliberationId)
        .single();

      if (deliberationError) throw deliberationError;
      setDeliberationTitle(deliberationData?.title || '');
      
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

      if (relationshipsError) logger.warn('Relationships error', relationshipsError as any);
      
      // Fetch messages for traceability
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('id, content, created_at, user_id')
        .eq('deliberation_id', deliberationId);

      if (messagesError) throw messagesError;

      logger.info('IBIS data loaded', {
        totalNodes: nodesData?.length || 0,
        issues: nodesData?.filter(n => n.node_type === 'issue').length || 0,
        positions: nodesData?.filter(n => n.node_type === 'position').length || 0,
        arguments: nodesData?.filter(n => n.node_type === 'argument').length || 0,
        relationships: relationshipsData?.length || 0,
        nodesSample: nodesData?.slice(0, 2)
      });

      setIbisNodes(nodesData || []);
      setIbisRelationships(relationshipsData || []);
      setMessages(messagesData || []);
      // Conversion is triggered by effect on [filterType, ibisNodes, ibisRelationships]

    } catch (error) {
      logger.error('Error fetching IBIS data', error as any);
      toast({
        title: "Error",
        description: "Failed to load IBIS data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsOptimizingLayout(false);
    }
  }, [deliberationId, toast]);

  // Ensure embeddings exist and link similar issues/positions/arguments (run once)
  const ensureEmbeddings = useCallback(async () => {
    if (linkingTriggeredRef.current) return;
    try {
      const types: Array<'issue' | 'position' | 'argument'> = ['issue', 'position', 'argument'];
      const missingTypes = types.filter(t => ibisNodes.some((n: any) => n.node_type === t && !n.embedding));

      // Compute embeddings for any missing types in parallel
      if (!embeddingBackfillTriggered && missingTypes.length > 0) {
        setEmbeddingBackfillTriggered(true);
        await Promise.all(
          missingTypes.map(t =>
            supabase.functions.invoke('ibis_embeddings', { body: { deliberationId, nodeType: t } })
          )
        );
      }

      // Link similar nodes for each type in parallel
      await Promise.all(
        types.map(t => supabase.functions.invoke('link_similar_ibis_issues', { body: { deliberationId, nodeType: t } }))
      );

      linkingTriggeredRef.current = true;
      // Refetch to include fresh embeddings and relationships
      fetchData();
    } catch (err) {
      logger.error('Embedding/linking optimization failed', err as any);
    }
  }, [embeddingBackfillTriggered, ibisNodes, deliberationId, fetchData]);

// moved to utils: calculateSemanticSimilarity

// moved to utils: calculateRelationshipStrength

// moved to utils: applyForceDirectedLayout

// moved to utils: getNodeDimensions

  // Enhanced node importance calculation
  const calculateNodeImportance = (nodeId: string, relationships: IbisRelationship[]): number => {
    const connections = relationships.filter(
      rel => rel.source_node_id === nodeId || rel.target_node_id === nodeId
    );
    
    // Base importance on connection count and types
    let importance = connections.length;
    connections.forEach(rel => {
      if (rel.relationship_type === 'supports' || rel.relationship_type === 'opposes') {
        importance += 0.5; // These are more important relationship types
      }
    });
    
    return Math.min(importance / 5, 2); // Normalize to max 2x scaling
  };
  // Compute concentric circle layout with zone constraints
  const computeConcentricLayout = (
    nodes: IbisNode[],
    relationships: IbisRelationship[] = [],
    canvas: { width: number; height: number } = { width: 1600, height: 1000 }
  ) => {
    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
      logger.debug(' Starting concentric layout calculation...', {
        nodesCount: nodes.length,
        relationshipsCount: relationships.length,
        canvas
      });
    }

    // Use the new concentric layout system
    const { positions: layoutPositions, zones: layoutZones } = applyConcentricLayout(
      nodes.map(n => ({
        id: n.id,
        title: n.title,
        node_type: n.node_type,
        position_x: null, // Force recalculation to apply zone constraints
        position_y: null,
        embedding: null,
        parent_id: n.parent_id,
        parent_node_id: undefined
      })),
      relationships.map(r => ({
        source_node_id: r.source_node_id,
        target_node_id: r.target_node_id,
        relationship_type: r.relationship_type
      })),
      canvas
    );
    
    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
      logger.debug(' Concentric layout completed:', {
        positionsCount: layoutPositions.size,
        zonesCalculated: !!layoutZones,
        issueZone: layoutZones?.issue,
        positionZone: layoutZones?.position,
        argumentZone: layoutZones?.argument,
        samplePositions: Array.from(layoutPositions.entries()).slice(0, 3)
      });
    }
    
    // Convert layout positions to simple positions map
    const positions = new Map<string, { x: number; y: number }>();
    layoutPositions.forEach((pos, id) => {
      positions.set(id, { x: pos.x, y: pos.y });
    });
    
    // Store zones for rendering - set immediately for this layout
    setZones(layoutZones);
    
    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
      logger.debug(' Zones set and positions converted:', {
        positionsMapSize: positions.size,
        zonesStored: !!layoutZones
      });
    }

    // Return simplified result for compatibility
    return positions;
  };

  // Convert IBIS nodes to React Flow nodes and edges with enhanced layout
  const convertToFlowNodes = (ibisNodesData: IbisNode[], relationshipsData: IbisRelationship[] = []) => {
    logger.info('Converting to flow nodes', {
      totalInput: ibisNodesData.length,
      beforeFilter: ibisNodesData.map(n => ({ id: n.id, type: n.node_type, title: n.title }))
    });

    // Apply filtering (Type only)
    const filteredNodes = ibisNodesData.filter(node => {
      const matchesType = filterType === 'all' || node.node_type === filterType;
      return matchesType;
    });

    // Memoization guard to skip redundant conversions
    const sig = `${filterType}|${filteredNodes.map(n => n.id).join(',')}|${relationshipsData.map(r => r.id).join(',')}|${Array.from(computedPositions.keys()).join(',')}`;
    if (lastConversionSigRef.current === sig) return;
    lastConversionSigRef.current = sig;

    logger.info('After filtering flow nodes', {
      filteredCount: filteredNodes.length,
      filterType,
      filteredNodes: filteredNodes.map(n => ({ id: n.id, type: n.node_type, title: n.title }))
    });

    // Use precomputed center-out positions
    const positionsMap = computedPositions;
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Add central deliberation node
    const centralPosition = positionsMap.get('deliberation-center') || { x: 800, y: 500 };
    const deliberationNode: Node = {
      id: 'deliberation-center',
      type: 'default',
      position: centralPosition,
      data: {
        label: (
          <div className="text-center p-4 node-content">
            <div className="font-bold text-white text-lg leading-tight mb-2">
              {deliberationTitle || 'Discussion Topic'}
            </div>
            <Badge 
              variant="secondary" 
              className="text-xs bg-white/20 text-white border-white/30"
            >
              Topic
            </Badge>
          </div>
        ),
      },
      className: 'ibis-node-deliberation',
      style: {
        backgroundColor: '#000000',
        borderRadius: '50%',
        border: '3px solid #fff',
        minWidth: 160,
        minHeight: 160,
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.2), 0 4px 15px rgba(0, 0, 0, 0.15)',
      },
      draggable: false,
      connectable: false,
      selectable: true,
    };
    flowNodes.push(deliberationNode);

    // Create nodes with precomputed positions and enhanced styling
    filteredNodes.forEach(node => {
      const position = positionsMap.get(node.id) || { x: 100, y: 100 };
      const importance = calculateNodeImportance(node.id, relationshipsData);
      const flowNode = createEnhancedFlowNode(node, position, importance);
      flowNodes.push(flowNode);
    });

    // Create hierarchical edges (parent-child relationships) - clean solid lines
    filteredNodes.forEach(node => {
      const parentId = (node as any).parent_node_id || (node as any).parent_id;
      if (parentId && filteredNodes.some(n => n.id === parentId)) {
        flowEdges.push({
          id: `parent-${parentId}-${node.id}`,
          source: parentId,
          target: node.id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))' },
          data: { type: 'hierarchy' },
        });
      }
    });

    // Create IBIS relationship edges (supports, opposes, relates_to, responds_to)
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    relationshipsData.forEach(relationship => {
      // Only create edges if both source and target nodes are in filtered set
      if (filteredNodeIds.has(relationship.source_node_id) && filteredNodeIds.has(relationship.target_node_id)) {
        const config = relationshipConfig[relationship.relationship_type] || relationshipConfig.relates_to; // Fallback for unknown types
        
        // Check if this is an auto-generated relationship
        const isAutoGenerated = relationship.created_by === null;
        
        if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
          logger.debug(' Creating edge:', {
            id: relationship.id,
            source: relationship.source_node_id,
            target: relationship.target_node_id,
            type: relationship.relationship_type,
            color: config.color,
            autoGenerated: isAutoGenerated
          });
        }
        
        flowEdges.push({
          id: relationship.id,
          source: relationship.source_node_id,
          target: relationship.target_node_id,
          type: 'smoothstep',
          animated: false,
          className: isAutoGenerated ? 'auto-generated-relationship' : 'manual-relationship',
          style: { 
            stroke: config.color, 
            strokeWidth: 4,
            strokeDasharray: config.style === 'dashed' ? '5,5' : undefined
          },
          markerEnd: { 
            type: MarkerType.ArrowClosed, 
            color: config.color,
            width: 20,
            height: 20
          },
          label: config.label,
          labelStyle: { 
            fontSize: '12px', 
            fontWeight: 600,
            fill: config.color
          },
          labelBgStyle: { 
            fill: 'hsl(var(--background))', 
            opacity: 0.9
          },
          data: { 
            type: 'relationship',
            relationshipType: relationship.relationship_type,
            isAutoGenerated
          },
        });
      }
    });

    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
      logger.debug(' Final flow data created:', {
        nodesCount: flowNodes.length,
        edgesCount: flowEdges.length,
        relationships: flowEdges.filter(e => e.data?.type === 'relationship').length,
        hierarchyEdges: flowEdges.filter(e => e.data?.type === 'hierarchy').length
      });
    }

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // Enhanced node creation with importance-based styling
  const createEnhancedFlowNode = (
    node: IbisNode, 
    position: { x: number; y: number }, 
    importance: number
  ): Node => {
    const config = nodeTypeConfig[node.node_type];
    const dimensions = getNodeDimensions(node.node_type);
    
    // Scale based on importance (1.0 to 1.5x)
    const scale = 1 + (importance - 1) * 0.3;
    const scaledWidth = dimensions.width * scale;
    const scaledHeight = dimensions.height * scale;
    
    // Enhanced text handling for longer titles
    const truncateText = (text: string, maxLength: number) => {
      return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    };
    
    return {
      id: node.id,
      type: 'default',
      position,
      data: {
        label: (
          <div className="text-center p-3 node-content">
            <div className={`font-semibold leading-tight mb-2 ${
              node.node_type === 'issue' ? 'text-white text-sm' : 'text-gray-800 text-xs'
            }`}>
              {truncateText(node.title, node.node_type === 'issue' ? 25 : 30)}
            </div>
            <Badge 
              variant="secondary" 
              className="text-xs"
            >
              {config.label}
            </Badge>
            {node.message_id && (
              <MessageSquare className="h-3 w-3 mt-1 mx-auto opacity-70" />
            )}
          </div>
        ),
      },
      className: `ibis-node-${node.node_type}`,
      style: {
        backgroundColor: config.color,
        borderRadius: node.node_type === 'issue' ? '50%' : 
                      node.node_type === 'argument' ? '0' : '12px',
        border: `2px solid hsl(var(--background))`,
        minWidth: scaledWidth,
        minHeight: scaledHeight,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
      draggable: false,
      connectable: false,
      selectable: true,
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

  // Precompute positions for the full dataset to keep layout stable across filters
  useEffect(() => {
    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
      logger.debug(' Layout effect triggered:', {
        ibisNodesLength: ibisNodes.length,
        ibisRelationshipsLength: ibisRelationships.length
      });
    }
    
    if (ibisNodes.length > 0) {
      const pos = computeConcentricLayout(ibisNodes, ibisRelationships);
      if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
        logger.debug(' Layout computed, setting positions:', {
          positionsSize: pos.size,
          sampleEntry: pos.entries().next().value
        });
      }
      setComputedPositions(pos);
    } else {
      setComputedPositions(new Map());
    }
  }, [ibisNodes, ibisRelationships]);

  // Trigger one-off embedding backfill if needed
  useEffect(() => {
    ensureEmbeddings();
  }, [ensureEmbeddings]);

  useEffect(() => {
    if (ibisNodes.length > 0) {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => convertToFlowNodes(ibisNodes, ibisRelationships));
      } else {
        setTimeout(() => convertToFlowNodes(ibisNodes, ibisRelationships), 0);
      }
    }
  }, [filterType, ibisNodes, ibisRelationships]);

  // Focus viewport on last user entry (if any) or center
  useEffect(() => {
    if (loading) return;
    if (nodes.length === 0) return;
    if (hasFocusedOnLoad.current) return;

    hasFocusedOnLoad.current = true;

    let targetNodeId: string | null = null;
    if (user?.id) {
      const userMsgIds = new Set(messages.filter((m) => m.user_id === user.id).map((m) => m.id));
      if (userMsgIds.size > 0) {
        const userNodes = ibisNodes.filter((n) => n.message_id && userMsgIds.has(n.message_id!));
        if (userNodes.length > 0) {
          userNodes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          targetNodeId = userNodes[0].id;
        }
      }
    }

    if (targetNodeId) {
      const pos = computedPositions.get(targetNodeId);
      if (pos) {
        reactFlowRef.current?.setCenter(pos.x, pos.y, { zoom: 1, duration: 400 });
      } else {
        const flowNode = nodes.find((n) => n.id === targetNodeId);
        if (flowNode) {
          reactFlowRef.current?.setCenter(flowNode.position.x, flowNode.position.y, { zoom: 1, duration: 400 });
        } else {
          reactFlowRef.current?.fitView({ duration: 400, padding: 0.2 });
        }
      }
    } else {
      reactFlowRef.current?.fitView({ duration: 400, padding: 0.2 });
    }

    setIsOptimizingLayout(false);
  }, [loading, nodes, user, messages, ibisNodes, computedPositions]);

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
          logger.info('IBIS nodes changed', payload);
          fetchData(); // Refresh nodes on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deliberationId, fetchData]);

  if (loading || isOptimizingLayout) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
          <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Zone backgrounds removed - they were causing visual misalignment

  return (
    <div className="h-full w-full relative">      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        fitView={false}
        nodesDraggable={isAdmin}
        nodesConnectable={isAdmin}
        nodesFocusable={isAdmin}
        edgesFocusable={isAdmin}
        connectOnClick={isAdmin}
        connectionMode={ConnectionMode.Loose}
        onInit={(instance: ReactFlowInstance) => {
          reactFlowRef.current = instance;
          if (!hasFocusedOnLoad.current && nodes.length > 0) {
            setTimeout(() => {
              instance.fitView({ padding: 0.15, duration: 1000 });
              hasFocusedOnLoad.current = true;
            }, 500);
          }
        }}
        className="bg-background relative"
      >
        <Background color="hsl(var(--ibis-grid))" gap={20} />
        <Controls />
        
        {/* Debug info panel at top */}
        <Panel position="top-left" className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-md">
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--ibis-issue))]"></div>
              <span>Issues: {ibisNodes.filter(n => n.node_type === 'issue').length}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-[hsl(var(--ibis-position))]"></div>
              <span>Positions: {ibisNodes.filter(n => n.node_type === 'position').length}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-[hsl(var(--ibis-argument))] transform rotate-45"></div>
              <span>Arguments: {ibisNodes.filter(n => n.node_type === 'argument').length}</span>
            </div>
            <div className="text-muted-foreground">
              Relationships: {ibisRelationships.length}
            </div>
            <div className="text-muted-foreground">
              Filtered: {nodes.length} nodes, {edges.length} edges
            </div>
            {zones && (
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Zone Layout Active
                <div>Issue R: {Math.round(zones.issue.outerRadius)}</div>
                <div>Position R: {Math.round(zones.position.outerRadius)}</div>
                <div>Argument R: {Math.round(zones.argument.outerRadius)}</div>
              </div>
            )}
          </div>
        </Panel>
        
        {/* Type Filter Panel */}
        <Panel position="top-right">
          <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-md w-56">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="issue">Issues</SelectItem>
                  <SelectItem value="position">Positions</SelectItem>
                  <SelectItem value="argument">Arguments</SelectItem>
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Panel>
      </ReactFlow>
      
      {/* Details Panel */}
      {selectedNode && (
        <div className="absolute top-0 right-0 w-80 h-full border-l border-border bg-card z-20">
          <Card className="h-full border-0 rounded-none flex flex-col min-h-0">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: nodeTypeConfig[selectedNode.node_type].color }}
                  />
                  Details
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
            <CardContent className="p-4 space-y-4 flex-1 overflow-y-auto">
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
              
              <div className="border-t pt-4">
                <h4 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <ArrowRightLeft className="h-4 w-4" />
                  Relationships
                </h4>
                {(() => {
                  const nodeRelationships = ibisRelationships.filter(rel => 
                    rel.source_node_id === selectedNode.id || rel.target_node_id === selectedNode.id
                  );
                  
                  if (nodeRelationships.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground italic">No relationships with other nodes</p>
                    );
                  }
                  
                  return (
                    <div className="space-y-2">
                      {nodeRelationships.map(rel => {
                        const isOutgoing = rel.source_node_id === selectedNode.id;
                        const connectedNodeId = isOutgoing ? rel.target_node_id : rel.source_node_id;
                        const connectedNode = ibisNodes.find(n => n.id === connectedNodeId);
                        const config = relationshipConfig[rel.relationship_type] || relationshipConfig.relates_to;
                        const isAutoGenerated = rel.created_by === null;
                        
                        if (!connectedNode) return null;
                        
                        return (
                          <div key={rel.id} className="text-xs border rounded-sm p-2 bg-muted/30">
                            <div className="flex items-center gap-2 mb-1">
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: config.color }}
                              />
                              <span className="font-medium">
                                {isOutgoing ? config.label : `${config.label.replace('s ', 's ')}ed by`}
                              </span>
                              {isAutoGenerated && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">Auto</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <div 
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: nodeTypeConfig[connectedNode.node_type].color }}
                              />
                              <span className="truncate">{connectedNode.title}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};