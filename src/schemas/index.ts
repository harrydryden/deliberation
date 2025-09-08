/**
 * Comprehensive Zod schemas for runtime validation and TypeScript type inference
 */
import { z } from 'zod';

// Base schemas
export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email();
export const URLSchema = z.string().url();
export const TimestampSchema = z.string().datetime();

// User and Profile schemas
export const UserRoleSchema = z.enum(['admin', 'user', 'moderator']);

export const ProfileSchema = z.object({
  id: UUIDSchema,
  bio: z.string().nullable(),
  avatar_url: URLSchema.nullable(),
  expertise_areas: z.array(z.string()).nullable(),
  user_role: UserRoleSchema,
  role: UserRoleSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

export const UserSchema = z.object({
  id: UUIDSchema,
  email: EmailSchema,
  role: UserRoleSchema,
  profile: ProfileSchema.optional(),
  accessCode: z.string().optional(),
  codeType: z.string().optional(),
});

// Authentication schemas
export const LoginCredentialsSchema = z.object({
  accessCode: z.string().min(1, 'Access code is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const SignupDataSchema = z.object({
  accessCode: z.string().min(1, 'Access code is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Message schemas
export const MessageTypeSchema = z.enum(['user', 'agent', 'system']);

export const MessageSchema = z.object({
  id: UUIDSchema,
  deliberation_id: UUIDSchema.nullable(),
  user_id: UUIDSchema.nullable(),
  content: z.string(),
  message_type: MessageTypeSchema,
  agent_context: z.record(z.string(), z.unknown()).nullable(),
  parent_message_id: UUIDSchema.nullable(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  submitted_to_ibis: z.boolean(),
});

// Deliberation schemas
export const DeliberationStatusSchema = z.enum(['draft', 'active', 'concluded', 'archived']);

export const DeliberationSchema = z.object({
  id: UUIDSchema,
  title: z.string().min(1, 'Title is required'),
  description: z.string().nullable(),
  facilitator_id: UUIDSchema.nullable(),
  status: DeliberationStatusSchema,
  start_time: TimestampSchema.nullable(),
  end_time: TimestampSchema.nullable(),
  max_participants: z.number().int().positive(),
  is_public: z.boolean(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  notion: z.string().nullable(),
});

export const CreateDeliberationSchema = DeliberationSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

// Agent schemas
export const AgentTypeSchema = z.enum(['facilitator', 'analyst', 'moderator', 'classifier']);

export const FacilitatorQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  context: z.string(),
  timing: z.enum(['early', 'mid', 'late']),
  priority: z.number().int().min(1).max(10),
});

export const FacilitatorConfigSchema = z.object({
  proactivePrompting: z.boolean(),
  maxPromptsPerSession: z.number().int().min(0),
  promptIntervalMinutes: z.number().int().min(1),
  enableSmartPrompting: z.boolean(),
  requireUserInteraction: z.boolean(),
});

export const agentConfigurationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  agent_type: z.string().min(1, 'Agent type is required'),
  goals: z.array(z.string()).optional(),
  response_style: z.string().optional(),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  deliberation_id: z.string().optional(),
  preset_questions: z.any().optional(),
  facilitator_config: z.any().optional(),
});

export const CreateAgentConfigurationSchema = agentConfigurationSchema.omit({});

// IBIS schemas
export const IbisNodeTypeSchema = z.enum(['issue', 'position', 'argument']);

export const IbisNodeSchema = z.object({
  id: UUIDSchema,
  deliberation_id: UUIDSchema.nullable(),
  message_id: UUIDSchema.nullable(),
  node_type: IbisNodeTypeSchema,
  title: z.string().min(1, 'Title is required'),
  description: z.string().nullable(),
  parent_node_id: UUIDSchema.nullable(),
  position_x: z.number(),
  position_y: z.number(),
  created_by: UUIDSchema.nullable(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  embedding: z.array(z.number()).nullable(),
});

export const IbisRelationshipTypeSchema = z.enum([
  'supports', 'objects_to', 'generalizes', 'specializes', 'questions', 'suggests'
]);

export const IbisRelationshipSchema = z.object({
  id: UUIDSchema,
  source_node_id: UUIDSchema,
  target_node_id: UUIDSchema,
  relationship_type: IbisRelationshipTypeSchema,
  created_at: TimestampSchema,
  created_by: UUIDSchema,
  deliberation_id: UUIDSchema,
});

// Access Code schemas (for user profiles)
export const AccessCodeTypeSchema = z.enum(['admin', 'user', 'moderator']);

export const UserAccessCodeSchema = z.object({
  access_code_1: z.string().length(5).regex(/^[A-Z]{5}$/),
  access_code_2: z.string().length(6).regex(/^\d{6}$/),
  role: AccessCodeTypeSchema,
});

// Error schemas
export const ErrorSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

export const ApiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  stack: z.string().optional(),
  timestamp: TimestampSchema.optional(),
  validation_errors: z.array(ValidationErrorSchema).optional(),
});

// Form state schemas
export const FormStateSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  data: dataSchema,
  errors: z.record(z.string(), z.string()),
  isSubmitting: z.boolean(),
  isDirty: z.boolean(),
  isValid: z.boolean(),
  touchedFields: z.record(z.string(), z.boolean()),
});

// API Response schemas
export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  data: z.array(itemSchema),
  pagination: PaginationSchema,
});

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  success: z.boolean(),
  data: dataSchema.optional(),
  error: ApiErrorSchema.optional(),
  timestamp: TimestampSchema,
});

// Knowledge Management schemas
export const DocumentProcessingStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

export const AgentKnowledgeSchema = z.object({
  id: UUIDSchema,
  agent_id: UUIDSchema.nullable(),
  title: z.string(),
  content: z.string(),
  content_type: z.string(),
  file_name: z.string().nullable(),
  file_size: z.number().int().positive().nullable(),
  original_file_size: z.number().int().positive().nullable(),
  chunk_index: z.number().int().min(0),
  embedding: z.array(z.number()).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  processing_status: DocumentProcessingStatusSchema,
  storage_path: z.string().nullable(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  created_by: UUIDSchema.nullable(),
});

// Security Event schemas
export const SecurityEventTypeSchema = z.enum([
  'login_attempt', 'login_success', 'login_failure',
  'access_code_validation', 'role_change', 'unauthorized_access',
  'suspicious_activity', 'data_breach_attempt'
]);

export const SecurityEventSchema = z.object({
  id: UUIDSchema,
  event_type: SecurityEventTypeSchema,
  user_id: UUIDSchema.nullable(),
  details: z.record(z.string(), z.unknown()),
  risk_level: ErrorSeveritySchema,
  resolved: z.boolean(),
  created_at: TimestampSchema,
});

// Type exports (inferred from schemas)
export type UUID = z.infer<typeof UUIDSchema>;
export type Email = z.infer<typeof EmailSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type User = z.infer<typeof UserSchema>;
export type LoginCredentials = z.infer<typeof LoginCredentialsSchema>;
export type SignupData = z.infer<typeof SignupDataSchema>;
export type MessageType = z.infer<typeof MessageTypeSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type DeliberationStatus = z.infer<typeof DeliberationStatusSchema>;
export type Deliberation = z.infer<typeof DeliberationSchema>;
export type CreateDeliberation = z.infer<typeof CreateDeliberationSchema>;
export type AgentType = z.infer<typeof AgentTypeSchema>;
export type FacilitatorQuestion = z.infer<typeof FacilitatorQuestionSchema>;
export type FacilitatorConfig = z.infer<typeof FacilitatorConfigSchema>;
export type AgentConfiguration = z.infer<typeof agentConfigurationSchema>;
export type CreateAgentConfiguration = z.infer<typeof CreateAgentConfigurationSchema>;
export type IbisNodeType = z.infer<typeof IbisNodeTypeSchema>;
export type IbisNode = z.infer<typeof IbisNodeSchema>;
export type IbisRelationshipType = z.infer<typeof IbisRelationshipTypeSchema>;
export type IbisRelationship = z.infer<typeof IbisRelationshipSchema>;
export type AccessCodeType = z.infer<typeof AccessCodeTypeSchema>;
export type AccessCode = z.infer<typeof UserAccessCodeSchema>;
export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type DocumentProcessingStatus = z.infer<typeof DocumentProcessingStatusSchema>;
export type AgentKnowledge = z.infer<typeof AgentKnowledgeSchema>;
export type SecurityEventType = z.infer<typeof SecurityEventTypeSchema>;
export type SecurityEvent = z.infer<typeof SecurityEventSchema>;

// Type guard helper functions
export function isValidUUID(value: unknown): value is UUID {
  return UUIDSchema.safeParse(value).success;
}

export function isValidEmail(value: unknown): value is Email {
  return EmailSchema.safeParse(value).success;
}

export function isValidUser(value: unknown): value is User {
  return UserSchema.safeParse(value).success;
}

export function isValidMessage(value: unknown): value is Message {
  return MessageSchema.safeParse(value).success;
}

export function isValidDeliberation(value: unknown): value is Deliberation {
  return DeliberationSchema.safeParse(value).success;
}

export function isValidAgentConfiguration(value: unknown): value is AgentConfiguration {
  return agentConfigurationSchema.safeParse(value).success;
}

export function isValidIbisNode(value: unknown): value is IbisNode {
  return IbisNodeSchema.safeParse(value).success;
}

// Validation helper functions
export function validateAndParse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed: ${result.error.message}`);
  }
  return result.data;
}

export function createValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } => {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, errors: result.error };
  };
}