# Edge Functions

This directory contains Supabase Edge Functions for the application.

## Import Policy

All edge functions MUST use the unified import map located at `supabase/functions/import_map.json`.

### ✅ Correct Import Usage

```typescript
// Use mapped imports
import "xhr";
import { serve } from "std/http/server.ts";
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { OpenAIEmbeddings } from '@langchain/openai';

// Relative imports for shared utilities
import { corsHeaders } from '../shared/edge-function-utils.ts';
```

### ❌ Incorrect Import Usage

```typescript
// Don't use direct URL imports
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://deno.land/x/openai@v4.57.0/mod.ts';
```

## Version Management

All dependency versions are centrally managed in `import_map.json`. To update versions:

1. Edit `supabase/functions/import_map.json`
2. Update the version in the URL for the specific package
3. Test all affected functions
4. Deploy

## Validation Script

Run the validation script to ensure all functions follow the import policy:

```bash
deno run --allow-read supabase/functions/shared/validate-functions.ts
```

This script checks:
- All functions use the unified import map
- No direct URL imports are used
- All function directories have corresponding config.toml entries
- The import map contains all required packages

## Adding New Functions

When creating new edge functions:

1. Create the function directory: `supabase/functions/your-function-name/`
2. Add `index.ts` with correct imports using the import map
3. Add function configuration to `supabase/config.toml`:
   ```toml
   [functions.your-function-name]
   verify_jwt = true
   import_map = "functions/import_map.json"
   ```
4. Run the validation script to ensure compliance

## Configuration

All functions in `supabase/config.toml` must use:
```toml
import_map = "functions/import_map.json"
```

This ensures consistent dependency resolution across all edge functions.

## Deployment

Edge functions are automatically deployed when the project builds. No manual deployment is needed.