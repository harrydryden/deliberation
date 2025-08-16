// Collision detection utilities for IBIS node positioning
import { getNodeDimensions } from './ibis-layout';

export type NodePosition = {
  x: number;
  y: number;
};

export type NodeWithPosition = {
  id: string;
  node_type: 'issue' | 'position' | 'argument';
  x: number;
  y: number;
};

/**
 * Check if two nodes overlap given their positions and dimensions
 */
export const doNodesOverlap = (
  node1: NodeWithPosition,
  node2: NodeWithPosition,
  minDistance: number = 20
): boolean => {
  const dims1 = getNodeDimensions(node1.node_type);
  const dims2 = getNodeDimensions(node2.node_type);
  
  // Calculate bounding boxes with min distance buffer
  const box1 = {
    left: node1.x - dims1.width / 2 - minDistance,
    right: node1.x + dims1.width / 2 + minDistance,
    top: node1.y - dims1.height / 2 - minDistance,
    bottom: node1.y + dims1.height / 2 + minDistance,
  };
  
  const box2 = {
    left: node2.x - dims2.width / 2,
    right: node2.x + dims2.width / 2,
    top: node2.y - dims2.height / 2,
    bottom: node2.y + dims2.height / 2,
  };
  
  // Check for overlap
  return !(
    box1.right < box2.left ||
    box1.left > box2.right ||
    box1.bottom < box2.top ||
    box1.top > box2.bottom
  );
};

/**
 * Find a non-overlapping position for a new node near a target position
 * Now includes zone constraint checking
 */
export const findNonOverlappingPosition = (
  targetPosition: NodePosition,
  nodeType: 'issue' | 'position' | 'argument',
  existingNodes: NodeWithPosition[],
  maxAttempts: number = 36,
  initialRadius: number = 80,
  radiusIncrement: number = 40,
  zoneConstraintFn?: (pos: NodePosition) => NodePosition
): NodePosition => {
  const candidateNode: NodeWithPosition = {
    id: 'temp',
    node_type: nodeType,
    x: targetPosition.x,
    y: targetPosition.y,
  };
  
  // First try the exact target position
  const hasOverlap = existingNodes.some(node => doNodesOverlap(candidateNode, node));
  if (!hasOverlap) {
    return targetPosition;
  }
  
  // Try positions in expanding spirals
  let radius = initialRadius;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const anglesPerRadius = Math.max(8, Math.floor(radius / 20)); // More angles for larger radii
    
    for (let i = 0; i < anglesPerRadius && attempts < maxAttempts; i++) {
      const angle = (i / anglesPerRadius) * 2 * Math.PI;
      let testPosition = {
        x: targetPosition.x + Math.cos(angle) * radius,
        y: targetPosition.y + Math.sin(angle) * radius,
      };
      
      // Apply zone constraint if provided
      if (zoneConstraintFn) {
        testPosition = zoneConstraintFn(testPosition);
      }
      
      candidateNode.x = testPosition.x;
      candidateNode.y = testPosition.y;
      
      const hasOverlapAtTest = existingNodes.some(node => doNodesOverlap(candidateNode, node));
      if (!hasOverlapAtTest) {
        return testPosition;
      }
      
      attempts++;
    }
    
    radius += radiusIncrement;
  }
  
  // Fallback: return target position with a random offset
  const fallbackAngle = Math.random() * 2 * Math.PI;
  let fallbackPosition = {
    x: targetPosition.x + Math.cos(fallbackAngle) * radius,
    y: targetPosition.y + Math.sin(fallbackAngle) * radius,
  };
  
  // Apply zone constraint to fallback if provided
  if (zoneConstraintFn) {
    fallbackPosition = zoneConstraintFn(fallbackPosition);
  }
  
  return fallbackPosition;
};

/**
 * Apply collision detection to a position map, adjusting overlapping nodes
 */
export const resolveCollisions = (
  positionsMap: Map<string, NodePosition>,
  nodesData: Array<{ id: string; node_type: 'issue' | 'position' | 'argument' }>,
  preserveClusterRelationships: boolean = true
): Map<string, NodePosition> => {
  const resolvedPositions = new Map(positionsMap);
  const processedNodes: NodeWithPosition[] = [];
  
  // Process nodes in order of importance: issues first, then positions, then arguments
  const orderedNodes = [
    ...nodesData.filter(n => n.node_type === 'issue'),
    ...nodesData.filter(n => n.node_type === 'position'),
    ...nodesData.filter(n => n.node_type === 'argument'),
  ];
  
  for (const node of orderedNodes) {
    const currentPos = resolvedPositions.get(node.id);
    if (!currentPos) continue;
    
    const nodeWithPos: NodeWithPosition = {
      id: node.id,
      node_type: node.node_type,
      x: currentPos.x,
      y: currentPos.y,
    };
    
    // Check for collisions with already processed nodes
    const hasCollision = processedNodes.some(existing => doNodesOverlap(nodeWithPos, existing));
    
    if (hasCollision) {
      // Find a non-overlapping position near the original
      const newPosition = findNonOverlappingPosition(
        currentPos,
        node.node_type,
        processedNodes,
        36, // maxAttempts
        node.node_type === 'issue' ? 100 : 60, // Initial radius based on node type
        node.node_type === 'issue' ? 50 : 30 // Radius increment based on node type
      );
      
      resolvedPositions.set(node.id, newPosition);
      nodeWithPos.x = newPosition.x;
      nodeWithPos.y = newPosition.y;
    }
    
    processedNodes.push(nodeWithPos);
  }
  
  return resolvedPositions;
};