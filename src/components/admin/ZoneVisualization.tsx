import { useReactFlow, useViewport } from '@xyflow/react';

interface ZoneVisualizationProps {
  zones: {
    issue: { outerRadius: number; centerX: number; centerY: number };
    position: { outerRadius: number; centerX: number; centerY: number };
    argument: { outerRadius: number; centerX: number; centerY: number };
  };
}

export const ZoneVisualization = ({ zones }: ZoneVisualizationProps) => {
  const reactFlow = useReactFlow();
  const viewport = useViewport();

  // Calculate screen position of zone center (0,0) using viewport transform
  const centerScreen = {
    x: viewport.x + viewport.zoom * 0,  // Transform world (0,0) to screen coordinates
    y: viewport.y + viewport.zoom * 0
  };

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <g>
        {/* Issue zone (innermost circle) */}
        <circle
          cx={centerScreen.x}
          cy={centerScreen.y}
          r={zones.issue.outerRadius * viewport.zoom}
          fill="hsl(var(--ibis-issue))"
          fillOpacity="0.08"
          stroke="hsl(var(--ibis-issue))"
          strokeWidth={3 * viewport.zoom}
          strokeOpacity="0.6"
          strokeDasharray="none"
        />
        
        {/* Position zone (middle ring) */}
        <circle
          cx={centerScreen.x}
          cy={centerScreen.y}
          r={zones.position.outerRadius * viewport.zoom}
          fill="none"
          stroke="hsl(var(--ibis-position))"
          strokeWidth={2 * viewport.zoom}
          strokeOpacity="0.5"
          strokeDasharray={`${8 * viewport.zoom},${4 * viewport.zoom}`}
        />
        
        {/* Argument zone (outer ring) */}
        <circle
          cx={centerScreen.x}
          cy={centerScreen.y}
          r={zones.argument.outerRadius * viewport.zoom}
          fill="none"
          stroke="hsl(var(--ibis-argument))"
          strokeWidth={2 * viewport.zoom}
          strokeOpacity="0.4"
          strokeDasharray={`${12 * viewport.zoom},${6 * viewport.zoom}`}
        />
        
        {/* Zone labels */}
        <text
          x={centerScreen.x}
          y={centerScreen.y - (zones.issue.outerRadius * viewport.zoom) - 15}
          textAnchor="middle"
          fill="hsl(var(--ibis-issue))"
          fontSize={14 * viewport.zoom}
          fontWeight="600"
          opacity="0.8"
        >
          Issues
        </text>
        
        <text
          x={centerScreen.x}
          y={centerScreen.y - (zones.position.outerRadius * viewport.zoom) - 15}
          textAnchor="middle"
          fill="hsl(var(--ibis-position))"
          fontSize={14 * viewport.zoom}
          fontWeight="600"
          opacity="0.8"
        >
          Positions
        </text>
        
        <text
          x={centerScreen.x}
          y={centerScreen.y - (zones.argument.outerRadius * viewport.zoom) - 15}
          textAnchor="middle"
          fill="hsl(var(--ibis-argument))"
          fontSize={14 * viewport.zoom}
          fontWeight="600"
          opacity="0.8"
        >
          Arguments
        </text>
        
        {/* Center point indicator */}
        <circle
          cx={centerScreen.x}
          cy={centerScreen.y}
          r={4 * viewport.zoom}
          fill="hsl(var(--muted-foreground))"
          opacity="0.6"
        />
      </g>
    </svg>
  );
};