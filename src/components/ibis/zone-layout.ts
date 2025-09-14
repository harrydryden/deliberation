// Zone-based concentric layout system for IBIS nodes
import { IbisNodeLike, IbisRelationshipLike, calculateSemanticSimilarity } from './ibis-layout';
import { logger } from '@/utils/logger';

export interface ZoneConfig {
  innerRadius: number;
  outerRadius: number;
  color: string;
  label: string;
}

export interface ConcentricZones {
  issue: ZoneConfig;
  position: ZoneConfig;
  argument: ZoneConfig;
  uncategorized?: ZoneConfig;
}

// Calculate zone boundaries based on canvas size and node counts
export const calculateZoneBoundaries = (
  canvas: { width: number; height: number },
  nodeTypeCounts: { issue: number; position: number; argument: number }
): ConcentricZones => {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const maxRadius = Math.min(centerX, centerY) * 0.85; // Leave margin
  
  // Base zone sizes with scaling based on node counts (expanded by 100%)
  const issueRadius = Math.max(240, Math.min(maxRadius * 0.5, 160 + nodeTypeCounts.issue * 16));
  const positionRadius = Math.max(issueRadius + 280, Math.min(maxRadius * 0.8, issueRadius + 240 + nodeTypeCounts.position * 8));
  const argumentRadius = Math.max(positionRadius + 240, Math.min(maxRadius, positionRadius + 200 + nodeTypeCounts.argument * 6));
  
  return {
    issue: {
      innerRadius: 0,
      outerRadius: issueRadius,
      color: 'hsl(var(--ibis-zone-issue))',
      label: 'Issues'
    },
    position: {
      innerRadius: issueRadius + 20,
      outerRadius: positionRadius,
      color: 'hsl(var(--ibis-zone-position))',
      label: 'Positions'
    },
    argument: {
      innerRadius: positionRadius + 20,
      outerRadius: argumentRadius,
      color: 'hsl(var(--ibis-zone-argument))',
      label: 'Arguments'
    }
  };
};

// Check if a position is within a zone's boundaries
export const isPositionInZone = (
  position: { x: number; y: number },
  center: { x: number; y: number },
  zone: ZoneConfig
): boolean => {
  const distance = Math.sqrt(
    Math.pow(position.x - center.x, 2) + Math.pow(position.y - center.y, 2)
  );
  return distance >= zone.innerRadius && distance <= zone.outerRadius;
};

// Constrain a position to stay within its designated zone
export const constrainToZone = (
  position: { x: number; y: number },
  center: { x: number; y: number },
  zone: ZoneConfig,
  nodeType: 'issue' | 'position' | 'argument' | 'uncategorized'
): { x: number; y: number } => {
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const angle = Math.atan2(dy, dx);
  
  let constrainedDistance = distance;
  
  // Keep nodes within their zone boundaries
  if (distance < zone.innerRadius) {
    constrainedDistance = zone.innerRadius + 10; // Small buffer from inner boundary
  } else if (distance > zone.outerRadius) {
    constrainedDistance = zone.outerRadius - 10; // Small buffer from outer boundary
  }
  
  return {
    x: center.x + Math.cos(angle) * constrainedDistance,
    y: center.y + Math.sin(angle) * constrainedDistance
  };
};

// Apply concentric force-directed layout with zone constraints
export const applyConcentricLayout = (
  nodes: IbisNodeLike[],
  relationships: IbisRelationshipLike[],
  canvas: { width: number; height: number } = { width: 1200, height: 800 }
) => {
  const center = { x: canvas.width / 2, y: canvas.height / 2 };
  const nodeTypeCounts = {
    issue: nodes.filter(n => n.node_type === 'issue').length,
    position: nodes.filter(n => n.node_type === 'position').length,
    argument: nodes.filter(n => n.node_type === 'argument').length,
    uncategorized: nodes.filter(n => n.node_type === 'uncategorized').length
  };
  
  const zones = calculateZoneBoundaries(canvas, nodeTypeCounts);
  if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {  
    logger.debug('Zone boundaries calculated:', zones);
  }
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  
  // Initial positioning within zones
  nodes.forEach((node, index) => {
    const zone = zones[node.node_type as keyof ConcentricZones];
    if (!zone) {
      // Handle uncategorized nodes - place them in a corner area
      const uncategorizedPos = {
        x: canvas.width * 0.85 + (index % 3) * 60,
        y: 50 + Math.floor(index / 3) * 60
      };
      positions.set(node.id, { ...uncategorizedPos, vx: 0, vy: 0 });
      return;
    }
    
    let initialPos;
    
    if (node.position_x && node.position_y) {
      // Use saved position but constrain to zone
      initialPos = constrainToZone(
        { x: node.position_x, y: node.position_y },
        center,
        zone,
        node.node_type
      );
    } else {
      // Generate new position within zone
      const nodesOfType = nodes.filter(n => n.node_type === node.node_type);
      const typeIndex = nodesOfType.indexOf(node);
      const angle = (typeIndex / Math.max(1, nodesOfType.length)) * 2 * Math.PI;
      
      // Position within the middle of the zone ring
      const targetRadius = (zone.innerRadius + zone.outerRadius) / 2;
      initialPos = {
        x: center.x + Math.cos(angle) * targetRadius,
        y: center.y + Math.sin(angle) * targetRadius
      };
    }
    
    positions.set(node.id, { ...initialPos, vx: 0, vy: 0 });
  });
  
  // Force-directed simulation with zone constraints
  const iterations = 150;
  const damping = 0.85;
  const repulsionStrength = 3000;
  const attractionStrength = 0.015;
  const zoneConstraintStrength = 0.1;
  
  for (let i = 0; i < iterations; i++) {
    // Apply damping
    nodes.forEach(node => {
      const pos = positions.get(node.id)!;
      pos.vx *= damping;
      pos.vy *= damping;
    });
    
    // Repulsion between nodes (stronger within same zone)
    for (let j = 0; j < nodes.length; j++) {
      for (let k = j + 1; k < nodes.length; k++) {
        const node1 = nodes[j];
        const node2 = nodes[k];
        const pos1 = positions.get(node1.id)!;
        const pos2 = positions.get(node2.id)!;
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        // Stronger repulsion within same zone to prevent clustering overlap
        const repulsionMultiplier = node1.node_type === node2.node_type ? 1.5 : 1.0;
        const force = (repulsionStrength * repulsionMultiplier) / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        
        pos1.vx += fx; pos1.vy += fy;
        pos2.vx -= fx; pos2.vy -= fy;
      }
    }
    
    // Attraction from relationships (reduced across zones)
    relationships.forEach(rel => {
      const sourcePos = positions.get(rel.source_node_id);
      const targetPos = positions.get(rel.target_node_id);
      const sourceNode = nodes.find(n => n.id === rel.source_node_id);
      const targetNode = nodes.find(n => n.id === rel.target_node_id);
      
      if (!sourcePos || !targetPos || !sourceNode || !targetNode) return;
      
      const dx = targetPos.x - sourcePos.x;
      const dy = targetPos.y - sourcePos.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      
      // Reduce attraction strength for cross-zone relationships
      const crossZoneMultiplier = sourceNode.node_type !== targetNode.node_type ? 0.3 : 1.0;
      const relationshipWeight = rel.relationship_type === 'supports' ? 1.0 :
                               rel.relationship_type === 'opposes' ? 0.8 :
                               rel.relationship_type === 'relates_to' ? 0.6 : 0.7;
      
      const force = attractionStrength * relationshipWeight * crossZoneMultiplier * distance;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      
      sourcePos.vx += fx; sourcePos.vy += fy;
      targetPos.vx -= fx; targetPos.vy -= fy;
    });
    
    // Semantic clustering within zones (for similar issues)
    nodes.forEach(node => {
      if (node.node_type !== 'issue') return;
      
      const pos = positions.get(node.id)!;
      const similarNodes = nodes.filter(n => 
        n.node_type === 'issue' && 
        n.id !== node.id &&
        calculateSemanticSimilarity(node, n) > 0.3
      );
      
      similarNodes.forEach(similarNode => {
        const similarPos = positions.get(similarNode.id)!;
        const dx = similarPos.x - pos.x;
        const dy = similarPos.y - pos.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const similarity = calculateSemanticSimilarity(node, similarNode);
        const force = attractionStrength * similarity * 2 * distance;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        
        pos.vx += fx; pos.vy += fy;
      });
    });
    
    // Apply zone constraints and update positions
    nodes.forEach(node => {
      const pos = positions.get(node.id)!;
      const zone = zones[node.node_type as keyof ConcentricZones];
      
      // Apply velocity
      pos.x += pos.vx;
      pos.y += pos.vy;
      
      // Only apply zone constraints for categorized nodes
      if (zone) {
        // Constrain to zone
        const constrainedPos = constrainToZone({ x: pos.x, y: pos.y }, center, zone, node.node_type);
      
        // Add zone constraint force if position was adjusted
        if (constrainedPos.x !== pos.x || constrainedPos.y !== pos.y) {
          const constraintFx = (constrainedPos.x - pos.x) * zoneConstraintStrength;
          const constraintFy = (constrainedPos.y - pos.y) * zoneConstraintStrength;
          pos.vx += constraintFx;
          pos.vy += constraintFy;
        }
        
        pos.x = constrainedPos.x;
        pos.y = constrainedPos.y;
      } else {
        // For uncategorized nodes, just keep them within canvas bounds
        pos.x = Math.max(20, Math.min(canvas.width - 20, pos.x));
        pos.y = Math.max(20, Math.min(canvas.height - 20, pos.y));
      }
    });
  }
  
  logger.debug(' Zone layout - Final result:', {
    positionsCount: positions.size,
    zones,
    samplePositions: Array.from(positions.entries()).slice(0, 2)
  });
  
  return { positions, zones };
};
