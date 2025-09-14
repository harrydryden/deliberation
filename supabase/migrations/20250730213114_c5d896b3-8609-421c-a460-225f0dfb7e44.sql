-- Find the remaining function with mutable search path
SELECT 
  p.proname as function_name,
  p.pronamespace::regnamespace as schema_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prokind = 'f'
  AND p.proname NOT LIKE 'vector%'
  AND p.proname NOT LIKE 'halfvec%'
  AND p.proname NOT LIKE 'sparsevec%'
  AND p.proname NOT LIKE 'array_to_%'
  AND p.proname NOT LIKE '%_distance'
  AND p.proname NOT LIKE '%_product'
  AND p.proname NOT LIKE 'l%_norm%'
  AND p.proname NOT LIKE 'binary_quantize'
  AND p.proname NOT LIKE 'subvector'
  AND p.proname NOT LIKE '%handler'
  AND p.proname NOT LIKE '%_support'
  AND p.proname NOT LIKE '%_typmod_%'
  AND p.proname NOT LIKE '%_in'
  AND p.proname NOT LIKE '%_out'
  AND p.proname NOT LIKE '%_recv'
  AND p.proname NOT LIKE '%_send'
  AND p.proname NOT LIKE '%_lt'
  AND p.proname NOT LIKE '%_le'
  AND p.proname NOT LIKE '%_eq'
  AND p.proname NOT LIKE '%_ne'
  AND p.proname NOT LIKE '%_ge'
  AND p.proname NOT LIKE '%_gt'
  AND p.proname NOT LIKE '%_cmp'
  AND p.proname NOT LIKE '%_accum'
  AND p.proname NOT LIKE '%_avg'
  AND p.proname NOT LIKE '%_combine'
  AND p.proname NOT LIKE '%_mul'
  AND p.proname NOT LIKE '%_add'
  AND p.proname NOT LIKE '%_sub'
  AND p.proname NOT LIKE '%_concat'
  AND p.proname NOT LIKE 'hamming_distance'
  AND p.proname NOT LIKE 'jaccard_distance'
  AND p.proname NOT LIKE 'cosine_distance'
  AND p.proname NOT LIKE 'inner_product'
  AND p.proname NOT LIKE 'l1_distance'
  AND p.proname NOT LIKE 'l2_distance'
  AND p.proname NOT IN ('is_admin_user', 'is_participant_in_deliberation', 'is_facilitator_of_deliberation', 'generate_secure_access_code', 'get_access_code_type', 'handle_new_user', 'update_updated_at_column')
  AND NOT (pg_get_functiondef(p.oid) LIKE '%SET search_path%')
ORDER BY p.proname;