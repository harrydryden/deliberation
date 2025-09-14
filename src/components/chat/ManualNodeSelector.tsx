import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import { CONFIDENCE_LEVELS } from '@/constants/ibisTypes';

interface Node {
  id: string;
  title: string;
  node_type: string;
}

interface ManualConnection {
  id: string;
  nodeId: string;
  relationshipType: string;
  node: Node;
}

interface ManualNodeSelectorProps {
  existingNodes: Node[];
  onConnectionsChange: (connections: Array<{id: string, type: string, confidence: number}>) => void;
  className?: string;
}

import { RELATIONSHIP_TYPE_OPTIONS } from '@/constants/ibisTypes';

export const ManualNodeSelector: React.FC<ManualNodeSelectorProps> = ({
  existingNodes,
  onConnectionsChange,
  className = ""
}) => {
  const [manualConnections, setManualConnections] = useState<ManualConnection[]>([]);

  const addConnection = () => {
    const newConnection: ManualConnection = {
      id: `manual-${Date.now()}`,
      nodeId: '',
      relationshipType: '',
      node: { id: '', title: '', node_type: '' }
    };
    const updated = [...manualConnections, newConnection];
    setManualConnections(updated);
  };

  const updateConnection = (connectionId: string, field: 'nodeId' | 'relationshipType', value: string) => {
    const updated = manualConnections.map(conn => {
      if (conn.id === connectionId) {
        if (field === 'nodeId') {
          const selectedNode = existingNodes.find(node => node.id === value);
          return {
            ...conn,
            nodeId: value,
            node: selectedNode || { id: '', title: '', node_type: '' }
          };
        } else {
          return { ...conn, relationshipType: value };
        }
      }
      return conn;
    });
    setManualConnections(updated);
    
    // Update parent with valid connections
    const validConnections = updated
      .filter(conn => conn.nodeId && conn.relationshipType)
      .map(conn => ({
        id: conn.nodeId,
        type: conn.relationshipType,
        confidence: CONFIDENCE_LEVELS.MANUAL_CONNECTION
      }));
    
    onConnectionsChange(validConnections);
  };

  const removeConnection = (connectionId: string) => {
    const updated = manualConnections.filter(conn => conn.id !== connectionId);
    setManualConnections(updated);
    
    // Update parent
    const validConnections = updated
      .filter(conn => conn.nodeId && conn.relationshipType)
      .map(conn => ({
        id: conn.nodeId,
        type: conn.relationshipType,
        confidence: CONFIDENCE_LEVELS.MANUAL_CONNECTION
      }));
    
    onConnectionsChange(validConnections);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Manual Connections</Label>
        <Button 
          type="button" 
          variant="outline" 
          size="sm"
          onClick={addConnection}
          className="flex items-center gap-2"
        >
          <Plus className="h-3 w-3" />
          Add Connection
        </Button>
      </div>

      {manualConnections.length === 0 ? (
        <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-lg text-center">
          Click "Add Connection" to manually link to existing items.
        </div>
      ) : (
        <div className="space-y-3">
          {manualConnections.map((connection) => (
            <div key={connection.id} className="p-3 border rounded-lg space-y-3 bg-card">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Connection #{manualConnections.indexOf(connection) + 1}</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={() => removeConnection(connection.id)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Node Selection */}
              <div>
                <Label className="text-xs">Select Item</Label>
                <Select 
                  value={connection.nodeId} 
                  onValueChange={(value) => updateConnection(connection.id, 'nodeId', value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose an existing item" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {existingNodes.map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {node.node_type}
                          </Badge>
                          <span className="truncate">{node.title}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Relationship Type Selection */}
              <div>
                <Label className="text-xs">Relationship Type (Optional)</Label>
                <Select 
                  value={connection.relationshipType} 
                  onValueChange={(value) => updateConnection(connection.id, 'relationshipType', value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose relationship type" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};