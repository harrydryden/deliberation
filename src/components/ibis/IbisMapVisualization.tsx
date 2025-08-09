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
  const { user } = useBackendAuth();
  
  const [isGuideCollapsed, setIsGuideCollapsed] = useState(false);
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

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
          console.error('Error updating node position:', error);
        }
      }
    }
  }, [onNodesChange, isAdmin, toast]);

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

      console.log('📊 IBIS Data loaded:', {
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

  // Calculate semantic similarity between nodes
  const calculateSemanticSimilarity = (node1: IbisNode, node2: IbisNode): number => {
    const words1 = new Set(node1.title.toLowerCase().split(' ').filter(w => w.length > 3));
    const words2 = new Set(node2.title.toLowerCase().split(' ').filter(w => w.length > 3));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  };

  // Calculate relationship strength based on type and frequency
  const calculateRelationshipStrength = (
    sourceId: string, 
    targetId: string, 
    relationships: IbisRelationship[]
  ): number => {
    const connections = relationships.filter(
      rel => (rel.source_node_id === sourceId && rel.target_node_id === targetId) ||
             (rel.source_node_id === targetId && rel.target_node_id === sourceId)
    );
    
    if (connections.length === 0) return 0;
    
    // Weight different relationship types
    const weights = {
      supports: 1.0,
      opposes: 0.8,
      relates_to: 0.6,
      responds_to: 0.7
    };
    
    return connections.reduce((sum, rel) => sum + weights[rel.relationship_type], 0);
  };

  // Force-directed layout algorithm with hierarchy respect
  const applyForceDirectedLayout = (
    nodes: IbisNode[], 
    relationships: IbisRelationship[],
    canvas: { width: number; height: number } = { width: 1200, height: 800 }
  ) => {
    const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    const issues = nodes.filter(n => n.node_type === 'issue');
    const positions_args = nodes.filter(n => n.node_type !== 'issue');
    
    // Initialize positions with saved coordinates or calculated positions
    nodes.forEach((node, index) => {
      if (node.position_x && node.position_y) {
        positions.set(node.id, { 
          x: node.position_x, 
          y: node.position_y, 
          vx: 0, 
          vy: 0 
        });
      } else {
        // Place issues in center area, others in outer ring
        if (node.node_type === 'issue') {
          const angle = (index / issues.length) * 2 * Math.PI;
          const radius = 100 + issues.length * 10;
          positions.set(node.id, {
            x: canvas.width / 2 + Math.cos(angle) * radius,
            y: canvas.height / 2 + Math.sin(angle) * radius,
            vx: 0,
            vy: 0
          });
        } else {
          const angle = (index / positions_args.length) * 2 * Math.PI;
          const radius = 200 + positions_args.length * 15;
          positions.set(node.id, {
            x: canvas.width / 2 + Math.cos(angle) * radius,
            y: canvas.height / 2 + Math.sin(angle) * radius,
            vx: 0,
            vy: 0
          });
        }
      }
    });

    // Force simulation parameters
    const iterations = 100;
    const damping = 0.9;
    const repulsionStrength = 5000;
    const attractionStrength = 0.01;
    const semanticAttractionStrength = 0.005;
    
    for (let i = 0; i < iterations; i++) {
      // Reset forces
      nodes.forEach(node => {
        const pos = positions.get(node.id)!;
        pos.vx *= damping;
        pos.vy *= damping;
      });

      // Repulsion forces between all nodes
      for (let j = 0; j < nodes.length; j++) {
        for (let k = j + 1; k < nodes.length; k++) {
          const node1 = nodes[j];
          const node2 = nodes[k];
          const pos1 = positions.get(node1.id)!;
          const pos2 = positions.get(node2.id)!;
          
          const dx = pos1.x - pos2.x;
          const dy = pos1.y - pos2.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const force = repulsionStrength / (distance * distance);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          pos1.vx += fx;
          pos1.vy += fy;
          pos2.vx -= fx;
          pos2.vy -= fy;
        }
      }

      // Attraction forces from relationships
      relationships.forEach(rel => {
        const sourcePos = positions.get(rel.source_node_id);
        const targetPos = positions.get(rel.target_node_id);
        if (!sourcePos || !targetPos) return;
        
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const strength = calculateRelationshipStrength(rel.source_node_id, rel.target_node_id, relationships);
        const force = attractionStrength * strength * distance;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        
        sourcePos.vx += fx;
        sourcePos.vy += fy;
        targetPos.vx -= fx;
        targetPos.vy -= fy;
      });

      // Semantic attraction (weaker)
      for (let j = 0; j < nodes.length; j++) {
        for (let k = j + 1; k < nodes.length; k++) {
          const node1 = nodes[j];
          const node2 = nodes[k];
          const similarity = calculateSemanticSimilarity(node1, node2);
          
          if (similarity > 0.3) { // Only attract semantically similar nodes
            const pos1 = positions.get(node1.id)!;
            const pos2 = positions.get(node2.id)!;
            
            const dx = pos2.x - pos1.x;
            const dy = pos2.y - pos1.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            
            const force = semanticAttractionStrength * similarity * distance;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            
            pos1.vx += fx;
            pos1.vy += fy;
            pos2.vx -= fx;
            pos2.vy -= fy;
          }
        }
      }

      // Apply velocities with constraints
      nodes.forEach(node => {
        const pos = positions.get(node.id)!;
        
        // Only apply forces if admin hasn't manually positioned or it's a new node
        if (!node.position_x || !node.position_y) {
          pos.x += pos.vx;
          pos.y += pos.vy;
          
          // Keep nodes within canvas bounds
          pos.x = Math.max(100, Math.min(canvas.width - 100, pos.x));
          pos.y = Math.max(100, Math.min(canvas.height - 100, pos.y));
        }
      });
    }

    return positions;
  };

  // Node dimensions for collision detection
  const getNodeDimensions = (nodeType: string) => {
    switch (nodeType) {
      case 'issue':
        return { width: 140, height: 140 }; // Slightly larger for central importance
      case 'position':
        return { width: 160, height: 90 };
      case 'argument':
        return { width: 160, height: 90 };
      default:
        return { width: 160, height: 90 };
    }
  };

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
  // Convert IBIS nodes to React Flow nodes and edges with enhanced layout
  const convertToFlowNodes = (ibisNodesData: IbisNode[], relationshipsData: IbisRelationship[] = []) => {
    console.log('🔄 Converting to flow nodes:', {
      totalInput: ibisNodesData.length,
      beforeFilter: ibisNodesData.map(n => ({ id: n.id, type: n.node_type, title: n.title }))
    });

    // Apply filtering
    const filteredNodes = ibisNodesData.filter(node => {
      const matchesSearch = searchTerm === '' || 
        node.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (node.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || node.node_type === filterType;
      return matchesSearch && matchesType;
    });

    console.log('🔍 After filtering:', {
      filteredCount: filteredNodes.length,
      searchTerm,
      filterType,
      filteredNodes: filteredNodes.map(n => ({ id: n.id, type: n.node_type, title: n.title }))
    });

    // Apply force-directed layout for better positioning
    const optimizedPositions = applyForceDirectedLayout(filteredNodes, relationshipsData);
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Create nodes with optimized positions and enhanced styling
    filteredNodes.forEach(node => {
      const position = optimizedPositions.get(node.id) || { x: 100, y: 100 };
      const importance = calculateNodeImportance(node.id, relationshipsData);
      const flowNode = createEnhancedFlowNode(node, position, importance);
      flowNodes.push(flowNode);
    });

    // Create hierarchical edges (parent-child relationships)
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
            strokeDasharray: '5,5',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#94a3b8',
          },
          data: { type: 'hierarchy' },
        });
      }
    });

    // Create enhanced relationship edges with curved paths and strength indicators
    relationshipsData.forEach(relationship => {
      if (filteredNodes.some(n => n.id === relationship.source_node_id) && 
          filteredNodes.some(n => n.id === relationship.target_node_id)) {
        const config = relationshipConfig[relationship.relationship_type];
        const strength = calculateRelationshipStrength(
          relationship.source_node_id, 
          relationship.target_node_id, 
          relationshipsData
        );
        
        flowEdges.push({
          id: `rel-${relationship.id}`,
          source: relationship.source_node_id,
          target: relationship.target_node_id,
          type: 'smoothstep', // Use smoothstep instead of bezier for better compatibility
          animated: relationship.relationship_type === 'supports' && strength > 0.7,
          style: { 
            stroke: config.color, 
            strokeWidth: Math.max(2, Math.min(6, 2 + strength * 2)), // Variable width based on strength
            strokeDasharray: config.style === 'dashed' ? '8,4' : 
                           config.style === 'dotted' ? '3,3' : 'none',
            opacity: Math.max(0.6, strength), // Variable opacity based on strength
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: config.color,
          },
          label: strength > 0.8 ? config.label : '', // Only show labels for strong relationships
          data: { 
            type: 'relationship',
            relationship: relationship,
            strength: strength
          },
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
          <div className="text-center p-3 node-content transition-all duration-300 hover:scale-105">
            <div className={`font-semibold leading-tight mb-2 ${
              node.node_type === 'issue' ? 'text-white text-sm' : 'text-gray-800 text-xs'
            }`}>
              {truncateText(node.title, node.node_type === 'issue' ? 25 : 30)}
            </div>
            <Badge 
              variant="secondary" 
              className={`text-xs transition-all ${importance > 1.2 ? 'bg-yellow-100 text-yellow-800' : ''}`}
            >
              {config.label}
              {importance > 1.2 && " ⭐"}
            </Badge>
            {node.message_id && (
              <MessageSquare className="h-3 w-3 mt-1 mx-auto opacity-70" />
            )}
          </div>
        ),
      },
      className: `ibis-node-${node.node_type} animate-fade-in`,
      style: {
        backgroundColor: config.color,
        borderRadius: node.node_type === 'issue' ? '50%' : 
                      node.node_type === 'argument' ? '0' : '12px',
        border: `${importance > 1.2 ? '3' : '2'}px solid ${importance > 1.2 ? '#fbbf24' : '#fff'}`,
        minWidth: scaledWidth,
        minHeight: scaledHeight,
        boxShadow: importance > 1.2 
          ? '0 8px 25px rgba(251, 191, 36, 0.3), 0 4px 15px rgba(0, 0, 0, 0.15)'
          : '0 4px 15px rgba(0, 0, 0, 0.15)',
        transform: `scale(${Math.min(1.1, scale)})`,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      },
      draggable: isAdmin,
    };
  };

  // Helper function to create flow nodes (legacy - keeping for compatibility)
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
      // Only allow dragging for admins
      draggable: isAdmin,
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
  }, [searchTerm, filterType, ibisNodes, ibisRelationships, isAdmin]);

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
          nodesDraggable={isAdmin}
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
        <div className="w-80 h-full border-l border-border bg-card">
          <Card className="h-full border-0 rounded-none flex flex-col min-h-0">
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
        <Card className="w-64">
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