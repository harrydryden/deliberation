import { useReactFlow, useViewport } from '@xyflow/react';

interface Zone {
  innerRadius: number;
  outerRadius: number;
  centerX: number;
  centerY: number;
  color?: string;
  strokeColor?: string;
}

interface ZoneVisualizationProps {
  zones: Record<string, Zone>;
}

export const ZoneVisualization = ({ zones }: ZoneVisualizationProps) => {
  const reactFlow = useReactFlow();
  const viewport = useViewport();

  // Calculate screen position of zone center (0,0) using viewport transform
  const centerScreen = {
    x: viewport.x + viewport.zoom * 0,  // Transform world (0,0) to screen coordinates
    y: viewport.y + viewport.zoom * 0
  };

  const zoneTypeConfig = {
    issue: { color: 'hsl(var(--ibis-issue))', label: 'Issues' },
    position: { color: 'hsl(var(--ibis-position))', label: 'Positions' },
    argument: { color: 'hsl(var(--ibis-argument))', label: 'Arguments' }
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
        zIndex: -1,
      }}
    >
      <defs>
        <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="1" fill="rgba(0,0,0,0.1)" />
        </pattern>
      </defs>
      
      {Object.entries(zones).map(([zoneType, zone]) => {
        const config = zoneTypeConfig[zoneType as keyof typeof zoneTypeConfig];
        if (!config) return null;
        
        return (
          <g key={zoneType}>
            {/* Outer circle */}
            <circle
              cx={centerScreen.x + zone.centerX * viewport.zoom}
              cy={centerScreen.y + zone.centerY * viewport.zoom}
              r={zone.outerRadius * viewport.zoom}
              fill={zone.color || config.color}
              fillOpacity="0.08"
              stroke={zone.strokeColor || config.color}
              strokeWidth={2 * viewport.zoom}
              strokeOpacity="0.5"
              strokeDasharray={`${8 * viewport.zoom},${4 * viewport.zoom}`}
            />
            
            {/* Inner circle (if innerRadius > 0) */}
            {zone.innerRadius > 0 && (
              <circle
                cx={centerScreen.x + zone.centerX * viewport.zoom}
                cy={centerScreen.y + zone.centerY * viewport.zoom}
                r={zone.innerRadius * viewport.zoom}
                fill="none"
                stroke={zone.strokeColor || config.color}
                strokeWidth={1 * viewport.zoom}
                strokeOpacity="0.3"
                strokeDasharray={`${5 * viewport.zoom},${5 * viewport.zoom}`}
              />
            )}
            
            {/* Zone label */}
            <text
              x={centerScreen.x + zone.centerX * viewport.zoom}
              y={centerScreen.y + zone.centerY * viewport.zoom - (zone.outerRadius * viewport.zoom) + 20}
              textAnchor="middle"
              fontSize={12 * viewport.zoom}
              fill={config.color}
              fontWeight="600"
              opacity="0.8"
            >
              {config.label.toUpperCase()} ZONE
            </text>
            
            {/* Radius indicators */}
            <text
              x={centerScreen.x + zone.centerX * viewport.zoom + (zone.outerRadius * viewport.zoom) - 10}
              y={centerScreen.y + zone.centerY * viewport.zoom + 5}
              textAnchor="end"
              fontSize={10 * viewport.zoom}
              fill={config.color}
              opacity="0.6"
            >
              {zone.outerRadius}px
            </text>
            
            {zone.innerRadius > 0 && (
              <text
                x={centerScreen.x + zone.centerX * viewport.zoom + (zone.innerRadius * viewport.zoom) - 10}
                y={centerScreen.y + zone.centerY * viewport.zoom + 5}
                textAnchor="end"
                fontSize={10 * viewport.zoom}
                fill={config.color}
                opacity="0.6"
              >
                {zone.innerRadius}px
              </text>
            )}
          </g>
        );
      })}
      
      {/* Center point indicator */}
      <circle
        cx={centerScreen.x}
        cy={centerScreen.y}
        r={3 * viewport.zoom}
        fill="hsl(var(--muted-foreground))"
        opacity="0.6"
      />
    </svg>
  );
};