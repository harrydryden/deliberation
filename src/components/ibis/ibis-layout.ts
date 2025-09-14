// IBIS layout helpers extracted for maintainability. Pure functions only.
// NOTE: Keep behavior identical to in-component versions.

export type IbisNodeLike = {
  id: string;
  title: string;
  node_type: 'issue' | 'position' | 'argument' | 'uncategorized';
  position_x?: number | null;
  position_y?: number | null;
  embedding?: number[] | null;
  parent_id?: string | null;
  parent_node_id?: string | null;
};

export type IbisRelationshipLike = {
  source_node_id: string;
  target_node_id: string;
  relationship_type: 'supports' | 'opposes' | 'relates_to' | 'responds_to';
};

// Basic semantic similarity using title word overlap (fallback when no embeddings)
export const calculateSemanticSimilarity = (node1: IbisNodeLike, node2: IbisNodeLike): number => {
  const words1 = new Set((node1.title || '').toLowerCase().split(' ').filter(w => w.length > 3));
  const words2 = new Set((node2.title || '').toLowerCase().split(' ').filter(w => w.length > 3));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return union.size > 0 ? intersection.size / union.size : 0;
};

// Relationship strength weighting mirrors in-component logic
export const calculateRelationshipStrength = (
  sourceId: string,
  targetId: string,
  relationships: IbisRelationshipLike[]
): number => {
  const connections = relationships.filter(
    rel => (rel.source_node_id === sourceId && rel.target_node_id === targetId) ||
           (rel.source_node_id === targetId && rel.target_node_id === sourceId)
  );
  if (connections.length === 0) return 0;
  const weights: Record<IbisRelationshipLike['relationship_type'], number> = {
    supports: 1.0,
    opposes: 0.8,
    relates_to: 0.6,
    responds_to: 0.7,
  };
  return connections.reduce((sum, rel) => sum + weights[rel.relationship_type], 0);
};

// Force-directed layout preserving behavior
export const applyForceDirectedLayout = (
  nodes: IbisNodeLike[],
  relationships: IbisRelationshipLike[],
  canvas: { width: number; height: number } = { width: 1200, height: 800 }
) => {
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  const issues = nodes.filter(n => n.node_type === 'issue');
  const positions_args = nodes.filter(n => n.node_type !== 'issue');

  nodes.forEach((node, index) => {
    if (node.position_x && node.position_y) {
      positions.set(node.id, { x: node.position_x, y: node.position_y, vx: 0, vy: 0 });
    } else {
      if (node.node_type === 'issue') {
        const angle = (index / Math.max(1, issues.length)) * 2 * Math.PI;
        const radius = 100 + issues.length * 10;
        positions.set(node.id, {
          x: canvas.width / 2 + Math.cos(angle) * radius,
          y: canvas.height / 2 + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
        });
      } else {
        const angle = (index / Math.max(1, positions_args.length)) * 2 * Math.PI;
        const radius = 200 + positions_args.length * 15;
        positions.set(node.id, {
          x: canvas.width / 2 + Math.cos(angle) * radius,
          y: canvas.height / 2 + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
        });
      }
    }
  });

  const iterations = 100;
  const damping = 0.9;
  const repulsionStrength = 5000;
  const attractionStrength = 0.01;

  for (let i = 0; i < iterations; i++) {
    // Reset/damp velocities
    nodes.forEach(node => {
      const pos = positions.get(node.id)!;
      pos.vx *= damping;
      pos.vy *= damping;
    });

    // Repulsion between all nodes
    for (let j = 0; j < nodes.length; j++) {
      for (let k = j + 1; k < nodes.length; k++) {
        const node1 = nodes[j];
        const node2 = nodes[k];
        const pos1 = positions.get(node1.id)!;
        const pos2 = positions.get(node2.id)!;
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsionStrength / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        pos1.vx += fx; pos1.vy += fy;
        pos2.vx -= fx; pos2.vy -= fy;
      }
    }

    // Attraction from relationships
    relationships.forEach(rel => {
      const sourcePos = positions.get(rel.source_node_id);
      const targetPos = positions.get(rel.target_node_id);
      if (!sourcePos || !targetPos) return;
      const dx = targetPos.x - sourcePos.x;
      const dy = targetPos.y - sourcePos.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const strength = calculateRelationshipStrength(rel.source_node_id, rel.target_node_id, relationships);
      const force = attractionStrength * strength * distance;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      sourcePos.vx += fx; sourcePos.vy += fy;
      targetPos.vx -= fx; targetPos.vy -= fy;
    });

    // Apply velocities with bounds if no saved position
    nodes.forEach(node => {
      const pos = positions.get(node.id)!;
      if (!node.position_x || !node.position_y) {
        pos.x += pos.vx;
        pos.y += pos.vy;
        pos.x = Math.max(100, Math.min(canvas.width - 100, pos.x));
        pos.y = Math.max(100, Math.min(canvas.height - 100, pos.y));
      }
    });
  }

  return positions;
};

// Node dimensions
export const getNodeDimensions = (nodeType: IbisNodeLike['node_type']) => {
  switch (nodeType) {
    case 'issue':
      return { width: 140, height: 140 };
    case 'position':
    case 'argument':
      return { width: 160, height: 90 };
    case 'uncategorized':
      return { width: 150, height: 100 };
    default:
      return { width: 160, height: 90 };
  }
};
