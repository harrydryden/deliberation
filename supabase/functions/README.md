# Supabase Edge Functions

This directory contains all Supabase Edge Functions for the deliberation platform.

## Architecture Policy

**Self-Contained Functions**: All edge functions are now self-contained with inlined utilities to ensure reliable deployment. Cross-folder imports have been eliminated due to build pipeline constraints.

### Deployment-Ready Functions

All functions in this directory are designed to deploy reliably without external dependencies:

- `admin_get_users/` - Admin user management
- `agent_orchestration_stream/` - AI agent orchestration  
- `calculate_user_stance/` - User stance analysis
- `classify_message/` - Message classification
- `ibis_embeddings/` - IBIS node embeddings
- `link_similar_ibis_issues/` - IBIS similarity linking
- `generate_notion_statement/` - Notion statement generation
- `knowledge_query/` - Knowledge base querying
- `generate_issue_recommendations/` - Issue recommendations
- `generate_proactive_prompt/` - Proactive prompts
- `realtime_session/` - OpenAI Realtime sessions
- `pdf_processor/` - PDF text extraction
- `voice_to_text/` - Speech transcription
- `relationship_evaluator/` - Relationship evaluation

### Development Guidelines

1. **No Cross-Folder Imports**: Each function must be self-contained
2. **Inline Utilities**: Copy shared utilities directly into function files
3. **Pinned Imports**: Use absolute URLs for external dependencies
4. **Minimal Dependencies**: Keep external imports to minimum required

### Shared Utilities (Reference Only)

The `shared/` directory contains reference implementations of common utilities:
- `edge-function-utils.ts` - Core utilities (inline these)
- `model-config.ts` - AI model configuration (inline these)  
- `edge-logger.ts` - Logging utilities (inline these)

**Important**: Do not import from `shared/` directory in new functions. Copy needed utilities directly into your function.

### Deployment

Functions are automatically deployed when code is pushed. Each function must have:
- `index.ts` file as entry point
- Self-contained implementation
- Proper error handling with inlined utilities

### Testing

Test functions locally using Supabase CLI:
```bash
supabase functions serve
```

Functions are also automatically tested in the deployment pipeline.

## Import Policy Change (2025)

Previously, this project used shared utilities via `../shared/` imports. Due to build pipeline constraints, all functions have been migrated to use inlined utilities for maximum deployment reliability.

### Migration Complete

All 14 active edge functions have been validated and updated with:
- ✅ Inlined shared utilities 
- ✅ Absolute URL imports for external dependencies
- ✅ Self-contained implementations
- ✅ No cross-folder dependencies

This ensures consistent, reliable deployments without "Entrypoint path does not exist" errors.