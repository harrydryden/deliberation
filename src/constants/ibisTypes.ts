// Centralized IBIS constants
export const VALID_RELATIONSHIP_TYPES = [
  'supports',
  'opposes', 
  'relates_to',
  'responds_to'
] as const;

export type RelationshipType = typeof VALID_RELATIONSHIP_TYPES[number];

export const RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'supports', label: 'Supports' },
  { value: 'opposes', label: 'Opposes' },
  { value: 'relates_to', label: 'Relates to' },
  { value: 'responds_to', label: 'Responds to' }
] as const;

export const NODE_TYPES = [
  'issue',
  'position', 
  'argument',
  'uncategorized'
] as const;

export type NodeType = typeof NODE_TYPES[number];

export const NODE_TYPE_OPTIONS = [
  { value: 'issue', label: 'Issue', description: 'A problem or question to be resolved' },
  { value: 'position', label: 'Position', description: 'A proposed solution or stance on an issue' },
  { value: 'argument', label: 'Argument', description: 'Supporting or opposing evidence for a position' },
  { value: 'uncategorized', label: 'Uncategorized', description: 'Content that doesn\'t fit other categories' }
] as const;

// Default confidence levels
export const CONFIDENCE_LEVELS = {
  AI_RECOMMENDATION: 0.8,
  MANUAL_CONNECTION: 1.0,
  STANCE_DEFAULT: 0.5
} as const;