import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ExpandableText } from '@/components/common/ExpandableText';
import { logger } from '@/utils/logger';

interface IbisNode {
  id: string;
  title: string;
  description?: string;
  node_type: 'issue' | 'position' | 'argument' | 'uncategorized';
  created_at: string;
  message_id?: string;
}

interface IbisRelationship {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: 'supports' | 'opposes' | 'relates_to' | 'responds_to';
}

interface IbisTableViewProps {
  deliberationId: string;
}

const nodeTypeConfig = {
  issue: { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Issue' },
  position: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Position' },
  argument: { color: 'bg-orange-100 text-orange-800 border-orange-200', label: 'Argument' },
  uncategorized: { color: 'bg-gray-100 text-gray-800 border-gray-200', label: 'Uncategorized' }
};

const relationshipConfig = {
  supports: { color: 'text-green-600', label: 'Supports' },
  opposes: { color: 'text-red-600', label: 'Opposes' },
  relates_to: { color: 'text-blue-600', label: 'Relates to' },
  responds_to: { color: 'text-purple-600', label: 'Responds to' }
};

export const IbisTableView: React.FC<IbisTableViewProps> = ({ deliberationId }) => {
  const [nodes, setNodes] = useState<IbisNode[]>([]);
  const [relationships, setRelationships] = useState<IbisRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Fetch IBIS data from Supabase
  const fetchIbisData = async () => {
    try {
      setLoading(true);

      // Fetch nodes
      const { data: nodesData, error: nodesError } = await supabase
        .from('ibis_nodes')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false });

      if (nodesError) throw nodesError;

      // Fetch relationships
      const { data: relationshipsData, error: relationshipsError } = await supabase
        .from('ibis_relationships')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false });

      if (relationshipsError) {
        logger.warn('Failed to fetch relationships', relationshipsError);
      }

      setNodes(nodesData || []);
      setRelationships(relationshipsData || []);
    } catch (error) {
      logger.error('Error fetching IBIS data for table view', error);
      toast({
        title: "Error",
        description: "Failed to load IBIS data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIbisData();
  }, [deliberationId]);

  // Get relationships for a specific node
  const getNodeRelationships = (nodeId: string) => {
    const nodeRelationships = relationships.filter(
      rel => rel.source_node_id === nodeId || rel.target_node_id === nodeId
    );

    return nodeRelationships.map(rel => {
      const isSource = rel.source_node_id === nodeId;
      const relatedNodeId = isSource ? rel.target_node_id : rel.source_node_id;
      const relatedNode = nodes.find(n => n.id === relatedNodeId);
      
      return {
        type: rel.relationship_type,
        direction: isSource ? 'outgoing' : 'incoming',
        relatedNode: relatedNode?.title || 'Unknown Node',
        relatedNodeType: relatedNode?.node_type || 'uncategorized'
      };
    });
  };

  // Filter and search nodes with custom ordering
  const filteredNodes = useMemo(() => {
    let filtered = nodes;

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(node =>
        node.title.toLowerCase().includes(searchLower) ||
        (node.description && node.description.toLowerCase().includes(searchLower))
      );
    }

    // Sort by type priority (issues, positions, arguments, uncategorized) then by date
    const typeOrder = { issue: 0, position: 1, argument: 2, uncategorized: 3 };
    filtered.sort((a, b) => {
      const typeComparison = typeOrder[a.node_type] - typeOrder[b.node_type];
      if (typeComparison !== 0) return typeComparison;
      
      // Within same type, sort by date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  }, [nodes, searchTerm]);

  const toggleRowExpansion = (nodeId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          IBIS Table View
        </CardTitle>
        
        {/* Search */}
        <div className="flex gap-2 pt-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto p-0">
        {filteredNodes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No IBIS Nodes Found</h3>
            <p>No nodes match your current filters.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Type</TableHead>
                <TableHead>Content</TableHead>
                <TableHead className="w-48">Related Issues</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNodes.map((node) => {
                const nodeRelationships = getNodeRelationships(node.id);
                
                return (
                  <TableRow key={node.id} className="group">
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={nodeTypeConfig[node.node_type].color}
                      >
                        {nodeTypeConfig[node.node_type].label}
                      </Badge>
                    </TableCell>
                    
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{node.title}</div>
                        {node.description && (
                          <div className="text-xs text-muted-foreground">
                            <ExpandableText text={node.description} maxLength={200} />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="space-y-1">
                        {nodeRelationships.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No relationships</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {nodeRelationships.map((rel, index) => (
                              <div key={index} className="text-xs">
                                <span className={relationshipConfig[rel.type].color}>
                                  {relationshipConfig[rel.type].label}
                                </span>
                                <span className="text-muted-foreground"> {rel.relatedNode}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};