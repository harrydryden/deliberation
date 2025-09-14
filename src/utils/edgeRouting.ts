import { Position } from '@xyflow/react';

export interface NodeDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HandleInfo {
  sourceHandle: string;
  targetHandle: string;
}

/**
 * Calculate the optimal handle positions for connecting two nodes
 * based on the shortest distance between them
 */
export function calculateOptimalHandles(
  sourceNode: NodeDimensions,
  targetNode: NodeDimensions
): HandleInfo {
  // Calculate center positions
  const sourceCenterX = sourceNode.x + sourceNode.width / 2;
  const sourceCenterY = sourceNode.y + sourceNode.height / 2;
  const targetCenterX = targetNode.x + targetNode.width / 2;
  const targetCenterY = targetNode.y + targetNode.height / 2;

  // Calculate angle between nodes
  const deltaX = targetCenterX - sourceCenterX;
  const deltaY = targetCenterY - sourceCenterY;
  
  // Determine source handle position based on direction to target
  let sourceHandle: string;
  let targetHandle: string;

  // Use absolute values to determine primary direction
  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);

  if (absDeltaX > absDeltaY) {
    // Horizontal movement is dominant
    if (deltaX > 0) {
      sourceHandle = "right";
      targetHandle = "left-target";
    } else {
      sourceHandle = "left";
      targetHandle = "right-target";
    }
  } else {
    // Vertical movement is dominant
    if (deltaY > 0) {
      sourceHandle = "bottom";
      targetHandle = "top-target";
    } else {
      sourceHandle = "top";
      targetHandle = "bottom-target";
    }
  }

  return { sourceHandle, targetHandle };
}

/**
 * Calculate distance between two handle positions on nodes
 */
export function calculateHandleDistance(
  sourceNode: NodeDimensions,
  targetNode: NodeDimensions,
  sourceHandle: Position,
  targetHandle: Position
): number {
  const sourcePoint = getHandlePosition(sourceNode, sourceHandle);
  const targetPoint = getHandlePosition(targetNode, targetHandle);
  
  const deltaX = targetPoint.x - sourcePoint.x;
  const deltaY = targetPoint.y - sourcePoint.y;
  
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/**
 * Get the actual coordinate position of a handle on a node
 */
function getHandlePosition(node: NodeDimensions, handle: Position): { x: number; y: number } {
  switch (handle) {
    case Position.Top:
      return { x: node.x + node.width / 2, y: node.y };
    case Position.Bottom:
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case Position.Left:
      return { x: node.x, y: node.y + node.height / 2 };
    case Position.Right:
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    default:
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  }
}