import { z } from 'zod';
import { NODE_TYPES, VALID_RELATIONSHIP_TYPES } from '@/constants/ibisTypes';

// IBIS Node Schema
export const IBISNodeSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
  node_type: z.enum(['issue', 'position', 'argument', 'uncategorized']),
  deliberation_id: z.string().uuid('Invalid deliberation ID'),
  message_id: z.string().uuid('Invalid message ID').optional(),
  parent_node_id: z.string().uuid('Invalid parent node ID').optional(),
  position_x: z.number().min(0).max(1920).optional(),
  position_y: z.number().min(0).max(1080).optional(),
  created_by: z.string().uuid('Invalid user ID')
});

// IBIS Relationship Schema
export const IBISRelationshipSchema = z.object({
  id: z.string().uuid().optional(),
  source_node_id: z.string().uuid('Invalid source node ID'),
  target_node_id: z.string().uuid('Invalid target node ID'),
  relationship_type: z.enum(['supports', 'opposes', 'relates_to', 'responds_to']),
  deliberation_id: z.string().uuid('Invalid deliberation ID'),
  created_by: z.string().uuid('Invalid user ID')
});

export const AIClassificationSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  keywords: z.array(z.string()).default([]),
  nodeType: z.enum(['issue', 'position', 'argument', 'uncategorized']),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  stanceScore: z.number().min(-1).max(1).optional()
});

// IBIS Submission Data Schema
export const IBISSubmissionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  nodeType: z.enum(['issue', 'position', 'argument', 'uncategorized']),
  parentNodeId: z.string().uuid().optional(),
  issueRecommendationRelationships: z.array(z.object({
    id: z.string().uuid(),
    type: z.enum(['supports', 'opposes', 'relates_to', 'responds_to']),
    confidence: z.number().min(0).max(1)
  })).default([]),
  manualRelationships: z.array(z.object({
    id: z.string().uuid(),
    type: z.enum(['supports', 'opposes', 'relates_to', 'responds_to']),
    confidence: z.number().min(0).max(1)
  })).default([]),
  selectedIssueId: z.string().uuid().optional(),
  isLinkingMode: z.boolean().default(false)
});

// Form validation schema for IBIS submission
export const IBISFormSchema = z.object({
  title: z.string().min(1, 'Please provide a title'),
  description: z.string().optional(),
  nodeType: z.enum(['issue', 'position', 'argument', 'uncategorized']),
  parentNodeId: z.string().optional()
});

// Type exports
export type IBISNodeType = z.infer<typeof IBISNodeSchema>;
export type IBISRelationshipType = z.infer<typeof IBISRelationshipSchema>;
export type AIClassificationType = z.infer<typeof AIClassificationSchema>;
export type IBISSubmissionType = z.infer<typeof IBISSubmissionSchema>;
export type IBISFormType = z.infer<typeof IBISFormSchema>;