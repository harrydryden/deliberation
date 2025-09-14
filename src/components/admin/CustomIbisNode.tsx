
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

interface ZoneBackgroundNodeData {
  label: string;
  isZoneBackground: boolean;
  zoneType: string;
}

const CustomIbisNode = ({ data }: NodeProps) => {
  // Handle zone background nodes that don't have originalNode
  if ((data as any).isZoneBackground) {
    const zoneData = data as unknown as ZoneBackgroundNodeData;
    return (
      <div
        style={{
          backgroundColor: 'transparent',
          border: '2px solid gray',
          borderRadius: '50%',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: 0.3,
        }}
      >
        <span style={{ 
          fontSize: '8px',
          fontWeight: 'bold',
          color: 'hsl(var(--foreground))',
          opacity: 0.7 
        }}>
          {zoneData.label}
        </span>
      </div>
    );
  }

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
        width: 60 * scaleFactor,
        height: nodeType === 'argument' ? 60 * scaleFactor : 40 * scaleFactor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px',
        fontSize: '6px',
        textAlign: 'center',
        fontWeight: 'bold',
        cursor: 'grab',
        transform: nodeType === 'argument' ? 'rotate(45deg)' : 'none',
        position: 'relative',
      }}
    >
      {/* Source handles for outgoing connections - smaller size */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        style={{
          background: '#3b82f6',
          border: '1px solid #1d4ed8',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          zIndex: 10,
          top: '-3px',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
      
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        style={{
          background: '#3b82f6',
          border: '1px solid #1d4ed8',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          zIndex: 10,
          bottom: '-3px',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
      
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        style={{
          background: '#3b82f6',
          border: '1px solid #1d4ed8',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          zIndex: 10,
          left: '-3px',
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />
      
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={{
          background: '#3b82f6',
          border: '1px solid #1d4ed8',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          zIndex: 10,
          right: '-3px',
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />

      {/* Target handles for incoming connections - smaller size and offset */}
      <Handle
        id="top-target"
        type="target"
        position={Position.Top}
        style={{
          background: '#10b981',
          border: '1px solid #059669',
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          zIndex: 9,
          top: '-2px',
          left: '40%',
          transform: 'translateX(-50%)',
        }}
      />
      
      <Handle
        id="bottom-target"
        type="target"
        position={Position.Bottom}
        style={{
          background: '#10b981',
          border: '1px solid #059669',
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          zIndex: 9,
          bottom: '-2px',
          left: '60%',
          transform: 'translateX(-50%)',
        }}
      />
      
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        style={{
          background: '#10b981',
          border: '1px solid #059669',
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          zIndex: 9,
          left: '-2px',
          top: '40%',
          transform: 'translateY(-50%)',
        }}
      />
      
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        style={{
          background: '#10b981',
          border: '1px solid #059669',
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          zIndex: 9,
          right: '-2px',
          top: '60%',
          transform: 'translateY(-50%)',
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
