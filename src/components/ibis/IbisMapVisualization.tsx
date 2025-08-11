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
import { RefreshCw, Plus, Search, Filter, MessageSquare, GitBranch } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBackendAuth } from '@/hooks/useBackendAuth';
import { calculateSemanticSimilarity, calculateRelationshipStrength, applyForceDirectedLayout, getNodeDimensions } from './ibis-layout';
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
  }
};

const relationshipConfig = {
  supports: { color: 'hsl(var(--ibis-rel-supports))', style: 'solid', label: 'Supports' },
  opposes: { color: 'hsl(var(--ibis-rel-opposes))', style: 'solid', label: 'Opposes' },
  relates_to: { color: 'hsl(var(--ibis-rel-relates))', style: 'solid', label: 'Relates to' },
  responds_to: { color: 'hsl(var(--ibis-rel-responds))', style: 'solid', label: 'Responds to' },
};

export const IbisMapVisualization = ({ deliberationId }: IbisMapVisualizationProps) => {
  const [ibisNodes, setIbisNodes] = useState<IbisNode[]>([]);
  const [ibisRelationships, setIbisRelationships] = useState<IbisRelationship[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [deliberationTitle, setDeliberationTitle] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<IbisNode | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
const [filterType, setFilterType] = useState<'all' | 'issue' | 'position' | 'argument'>('all');
const { toast } = useToast();
const { user } = useBackendAuth();
  
  const [isGuideCollapsed, setIsGuideCollapsed] = useState(true);
  const [isOptimizingLayout, setIsOptimizingLayout] = useState(true);
  const hasFocusedOnLoad = useRef(false);
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const [computedPositions, setComputedPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [embeddingBackfillTriggered, setEmbeddingBackfillTriggered] = useState(false);
  const lastConversionSigRef = useRef<string | null>(null);
  const linkingTriggeredRef = useRef(false);

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
              updated_at: new Date().toISOString(),
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

  // Ensure embeddings exist and link similar issues (run once)
  const ensureEmbeddings = useCallback(async () => {
    if (linkingTriggeredRef.current) return;
    try {
      const missing = ibisNodes.filter((n: any) => n.node_type === 'issue' && !n.embedding);
      if (!embeddingBackfillTriggered && missing.length > 0) {
        setEmbeddingBackfillTriggered(true);
        await supabase.functions.invoke('compute-ibis-embeddings', { body: { deliberationId } });
      }
      // Create supportive edges between semantically similar issues
      await supabase.functions.invoke('link-similar-ibis-issues', { body: { deliberationId } });
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
  // Compute center-out mind map layout with semantic clustering of Issues
  const computeMindMapLayout = (
    nodes: IbisNode[],
    relationships: IbisRelationship[] = [],
    canvas: { width: number; height: number } = { width: 1600, height: 1000 }
  ) => {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const positions = new Map<string, { x: number; y: number }>();

    // Add central deliberation node position
    positions.set('deliberation-center', { x: cx, y: cy });

    const allById = new Map(nodes.map(n => [n.id, n] as const));

    const getParentId = (n: any): string | undefined => n.parent_node_id || n.parent_id || undefined;

    const issues = nodes.filter(n => n.node_type === 'issue');
    const positionsNodes = nodes.filter(n => n.node_type === 'position');
    const argumentsNodes = nodes.filter(n => n.node_type === 'argument');

    // Similarity: use embedding cosine if present, else fallback to title Jaccard
    const cosine = (a: number[], b: number[]) => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
    };
    const getEmbed = (n: any): number[] | null => Array.isArray(n.embedding) ? n.embedding as number[] : null;
    const simIssues = (a: IbisNode, b: IbisNode) => {
      const ea = getEmbed(a), eb = getEmbed(b);
      if (ea && eb) return cosine(ea, eb);
      return calculateSemanticSimilarity(a, b);
    };

    // Greedy ordering: place similar issues adjacent
    const remaining = [...issues];
    const ordered: IbisNode[] = [];
    if (remaining.length) {
      remaining.sort((x, y) => x.title.localeCompare(y.title));
      ordered.push(remaining.shift()!);
      while (remaining.length) {
        const last = ordered[ordered.length - 1];
        let bestIdx = 0;
        let bestScore = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const s = simIssues(last, remaining[i]);
          if (s > bestScore) { bestScore = s; bestIdx = i; }
        }
        ordered.push(remaining.splice(bestIdx, 1)[0]);
      }
    }

    // Place Issues on R1 evenly
    const nI = ordered.length;
    const baseR1 = 260 + Math.min(240, Math.max(0, nI - 8) * 6);
    const R1 = baseR1; // issues ring (scaled)
    const R2 = R1 + 180 + Math.min(300, positionsNodes.length * 0.5); // positions ring
    const R3 = R2 + 180 + Math.min(300, argumentsNodes.length * 0.3); // arguments ring

    // Place Issues on R1 evenly
    ordered.forEach((iss, i) => {
      const angle = (i / Math.max(1, nI)) * 2 * Math.PI - Math.PI / 2;
      positions.set(iss.id, { x: cx + Math.cos(angle) * R1, y: cy + Math.sin(angle) * R1 });
    });

    // For each Issue, place its Positions in a small sector around the issue angle
    const issueAngle = new Map<string, number>();
    ordered.forEach((iss, i) => {
      const angle = (i / Math.max(1, nI)) * 2 * Math.PI - Math.PI / 2;
      issueAngle.set(iss.id, angle);
    });

    // Helper to find connections in relationships
    const getConnectedNodes = (nodeId: string, targetType: string) => {
      return relationships
        .filter(rel => rel.source_node_id === nodeId || rel.target_node_id === nodeId)
        .map(rel => rel.source_node_id === nodeId ? rel.target_node_id : rel.source_node_id)
        .map(id => allById.get(id))
        .filter(n => n && n.node_type === targetType) as IbisNode[];
    };

    const byParent = (list: IbisNode[], pid: string) => list.filter(n => getParentId(n) === pid);

    // Position positions near their connected issues or their parent issues
    positionsNodes.forEach((position) => {
      const connectedIssues = getConnectedNodes(position.id, 'issue');
      const parentIssues = getParentId(position) ? [allById.get(getParentId(position)!)].filter(Boolean) as IbisNode[] : [];
      const relevantIssues = connectedIssues.length > 0 ? connectedIssues : parentIssues;
      
      if (relevantIssues.length > 0) {
        // Position near the centroid of connected/parent issues
        let sumX = 0, sumY = 0;
        
        relevantIssues.forEach(issue => {
          const issuePos = positions.get(issue.id);
          if (issuePos) {
            sumX += issuePos.x;
            sumY += issuePos.y;
          }
        });
        
        const centroidX = sumX / relevantIssues.length;
        const centroidY = sumY / relevantIssues.length;
        const avgAngle = Math.atan2(centroidY - cy, centroidX - cx);
        
        // Add slight offset based on position index to avoid overlap
        const positionIndex = positionsNodes.indexOf(position);
        const offsetAngle = (positionIndex % 3 - 1) * 0.2;
        const finalAngle = avgAngle + offsetAngle;
        
        positions.set(position.id, {
          x: cx + Math.cos(finalAngle) * R2,
          y: cy + Math.sin(finalAngle) * R2
        });
      } else {
        // Fallback: use parent-based positioning for hierarchical layout
        ordered.forEach((iss) => {
          const angleCenter = issueAngle.get(iss.id)!;
          const children = byParent(positionsNodes, iss.id);
          const count = children.length;
          const sector = Math.min(Math.PI / 3, Math.max(Math.PI / 12, count * 0.08));
          for (let i = 0; i < count; i++) {
            const t = count > 1 ? (i / (count - 1)) - 0.5 : 0;
            const a = angleCenter + t * sector;
            if (children[i].id === position.id) {
              positions.set(position.id, { x: cx + Math.cos(a) * R2, y: cy + Math.sin(a) * R2 });
            }
          }
        });
      }
    });

    // Position arguments near their connected positions or their parent positions  
    argumentsNodes.forEach((argument) => {
      const connectedPositions = getConnectedNodes(argument.id, 'position');
      const parentPositions = getParentId(argument) ? [allById.get(getParentId(argument)!)].filter(Boolean) as IbisNode[] : [];
      const relevantPositions = connectedPositions.length > 0 ? connectedPositions : parentPositions;
      
      if (relevantPositions.length > 0) {
        // Position near the centroid of connected/parent positions
        let sumX = 0, sumY = 0;
        
        relevantPositions.forEach(pos => {
          const posPos = positions.get(pos.id);
          if (posPos) {
            sumX += posPos.x;
            sumY += posPos.y;
          }
        });
        
        const centroidX = sumX / relevantPositions.length;
        const centroidY = sumY / relevantPositions.length;
        const avgAngle = Math.atan2(centroidY - cy, centroidX - cx);
        
        // Add slight offset based on argument index to avoid overlap
        const argumentIndex = argumentsNodes.indexOf(argument);
        const offsetAngle = (argumentIndex % 3 - 1) * 0.15;
        const finalAngle = avgAngle + offsetAngle;
        
        positions.set(argument.id, {
          x: cx + Math.cos(finalAngle) * R3,
          y: cy + Math.sin(finalAngle) * R3
        });
      } else {
        // Fallback: use parent-based positioning for hierarchical layout
        positionsNodes.forEach((posNode) => {
          if (positions.has(posNode.id)) {
            const posAngle = Math.atan2((positions.get(posNode.id)!.y - cy), (positions.get(posNode.id)!.x - cx));
            const args = byParent(argumentsNodes, posNode.id);
            const ac = args.length;
            const aSector = Math.min(Math.PI / 6, Math.max(Math.PI / 24, ac * 0.06));
            for (let j = 0; j < ac; j++) {
              const t = ac > 1 ? (j / (ac - 1)) - 0.5 : 0;
              const a = posAngle + t * aSector;
              if (args[j].id === argument.id) {
                positions.set(argument.id, { x: cx + Math.cos(a) * R3, y: cy + Math.sin(a) * R3 });
              }
            }
          }
        });
      }
    });

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
    if (ibisNodes.length > 0) {
      const pos = computeMindMapLayout(ibisNodes, ibisRelationships);
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

  return (
    <div className="h-full flex">
      {/* Main Flow Area */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          attributionPosition="bottom-left"
          className="bg-background"
          onInit={(instance: ReactFlowInstance<Node, Edge>) => { reactFlowRef.current = instance; }}
          nodesConnectable={false}
          elementsSelectable={true}
          connectionMode={ConnectionMode.Loose}
        >
          <Background color="hsl(var(--ibis-grid))" gap={20} />
          <Controls />
          
          {/* Type Filter Panel */}
          <Panel position="top-left">
            <div className="bg-white p-3 rounded-lg shadow-md border w-56">
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
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Details Panel */}
      {selectedNode && (
        <div className="w-80 h-full border-l border-border bg-card">
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
        <Card className={isGuideCollapsed ? "w-36" : "w-72"}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1">
                <GitBranch className="h-4 w-4" />
                Guide
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsGuideCollapsed((v) => !v)}
                aria-label={isGuideCollapsed ? "Show guide" : "Hide guide"}
              >
                {isGuideCollapsed ? 'Show' : 'Hide'}
              </Button>
            </div>
          </CardHeader>
          {!isGuideCollapsed && (
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
                {isAdmin ? (
                  <div>• Drag nodes to reposition (Admin)</div>
                ) : (
                  <div>• Add new nodes and connections</div>
                )}
                <div>• Use Connect mode to link nodes</div>
                <div>• Click nodes for details</div>
                {!isAdmin && (
                  <div className="text-amber-600">• Editing restricted to admins</div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </Panel>
    </div>
  );
};