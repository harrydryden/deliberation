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
          fontSize: '8px', // 50% smaller: 16px -> 8px
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
        width: 60 * scaleFactor, // 50% smaller: 120 -> 60
        height: nodeType === 'argument' ? 60 * scaleFactor : 40 * scaleFactor, // 50% smaller: 120->60, 80->40
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px', // 50% smaller: 8px -> 4px
        fontSize: '6px', // 50% smaller: 11px -> 6px
        textAlign: 'center',
        fontWeight: 'bold',
        cursor: 'grab',
        transform: nodeType === 'argument' ? 'rotate(45deg)' : 'none',
        position: 'relative',
      }}
    >
      {/* Source handles for outgoing connections */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        style={{
          background: '#3b82f6',
          border: '2px solid #1d4ed8',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
          top: '-6px',
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
          border: '2px solid #1d4ed8',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
          bottom: '-6px',
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
          border: '2px solid #1d4ed8',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
          left: '-6px',
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
          border: '2px solid #1d4ed8',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          zIndex: 10,
          right: '-6px',
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />

      {/* Target handles for incoming connections - offset slightly */}
      <Handle
        id="top-target"
        type="target"
        position={Position.Top}
        style={{
          background: '#10b981',
          border: '2px solid #059669',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          zIndex: 9,
          top: '-4px',
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
          border: '2px solid #059669',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          zIndex: 9,
          bottom: '-4px',
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
          border: '2px solid #059669',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          zIndex: 9,
          left: '-4px',
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
          border: '2px solid #059669',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          zIndex: 9,
          right: '-4px',
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