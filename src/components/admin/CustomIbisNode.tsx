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
      {/* Connection handles with specific IDs */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        style={{
          background: '#6b7280',
          border: '2px solid #4b5563',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        style={{
          background: '#6b7280',
          border: '2px solid #4b5563',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        style={{
          background: '#6b7280',
          border: '2px solid #4b5563',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={{
          background: '#6b7280',
          border: '2px solid #4b5563',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      {/* Target handles for receiving connections */}
      <Handle
        id="top-target"
        type="target"
        position={Position.Top}
        style={{
          background: '#6b7280',
          border: '2px solid #4b5563',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      <Handle
        id="bottom-target"
        type="target"
        position={Position.Bottom}
        style={{
          background: '#6b7280',
          border: '2px solid #4b5563',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        style={{
          background: '#6b7280',
          border: '2px solid #4b5563',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
        }}
      />
      
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        style={{
          background: '#6b7280',
          border: '2px solid #4b5563',
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