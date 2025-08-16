import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface CustomIbisNodeData {
  label: string;
  originalNode: any;
  config: {
    color: string;
    shape: string;
    label: string;
  };
  scaleFactor: number;
}

const CustomIbisNode = ({ data }: NodeProps) => {
  const { label, originalNode, config, scaleFactor } = data as unknown as CustomIbisNodeData;
  const nodeType = originalNode.node_type;

  return (
    <div
      style={{
        backgroundColor: config.color,
        color: 'white',
        border: '2px solid white',
        borderRadius: nodeType === 'issue' ? '50%' : 
                    nodeType === 'argument' ? '0' : '8px',
        width: 120 * scaleFactor,
        height: nodeType === 'argument' ? 120 * scaleFactor : 80 * scaleFactor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        fontSize: '11px',
        textAlign: 'center',
        fontWeight: 'bold',
        cursor: 'grab',
        transform: nodeType === 'argument' ? 'rotate(45deg)' : 'none',
        position: 'relative',
      }}
    >
      {/* Connection handles - Top */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: '#4ade80',
          border: '2px solid #22c55e',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      {/* Connection handles - Bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: '#3b82f6',
          border: '2px solid #2563eb',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      {/* Connection handles - Left */}
      <Handle
        type="source"
        position={Position.Left}
        style={{
          background: '#f59e0b',
          border: '2px solid #d97706',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      {/* Connection handles - Right */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#ef4444',
          border: '2px solid #dc2626',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      {/* Node content */}
      <div style={{ 
        zIndex: 1,
        transform: nodeType === 'argument' ? 'rotate(-45deg)' : 'none',
      }}>
        {label}
      </div>
    </div>
  );
};

export default memo(CustomIbisNode);