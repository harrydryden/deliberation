-- Phase 3: Final cleanup - address remaining minor inconsistencies

-- 1. Clean up unused vector-related functions that aren't being used in the app
DROP FUNCTION IF EXISTS public.l1_distance(vector, vector);
DROP FUNCTION IF EXISTS public.l2_distance(vector, vector);
DROP FUNCTION IF EXISTS public.inner_product(vector, vector);
DROP FUNCTION IF EXISTS public.cosine_distance(vector, vector);
DROP FUNCTION IF EXISTS public.vector_dims(vector);
DROP FUNCTION IF EXISTS public.vector_norm(vector);
DROP FUNCTION IF EXISTS public.l2_normalize(vector);
DROP FUNCTION IF EXISTS public.binary_quantize(vector);
DROP FUNCTION IF EXISTS public.subvector(vector, integer, integer);
DROP FUNCTION IF EXISTS public.vector_add(vector, vector);
DROP FUNCTION IF EXISTS public.vector_sub(vector, vector);
DROP FUNCTION IF EXISTS public.vector_mul(vector, vector);
DROP FUNCTION IF EXISTS public.vector_concat(vector, vector);

-- 2. Clean up duplicate vector functions for different types
DROP FUNCTION IF EXISTS public.l1_distance(halfvec, halfvec);
DROP FUNCTION IF EXISTS public.l2_distance(halfvec, halfvec);
DROP FUNCTION IF EXISTS public.inner_product(halfvec, halfvec);
DROP FUNCTION IF EXISTS public.cosine_distance(halfvec, halfvec);
DROP FUNCTION IF EXISTS public.l1_distance(sparsevec, sparsevec);
DROP FUNCTION IF EXISTS public.l2_distance(sparsevec, sparsevec);
DROP FUNCTION IF EXISTS public.inner_product(sparsevec, sparsevec);
DROP FUNCTION IF EXISTS public.cosine_distance(sparsevec, sparsevec);

-- 3. Clean up unused comparison and utility functions
DROP FUNCTION IF EXISTS public.vector_lt(vector, vector);
DROP FUNCTION IF EXISTS public.vector_le(vector, vector);
DROP FUNCTION IF EXISTS public.vector_eq(vector, vector);
DROP FUNCTION IF EXISTS public.vector_ne(vector, vector);
DROP FUNCTION IF EXISTS public.vector_ge(vector, vector);
DROP FUNCTION IF EXISTS public.vector_gt(vector, vector);
DROP FUNCTION IF EXISTS public.vector_cmp(vector, vector);

-- 4. Remove unused specialized distance functions
DROP FUNCTION IF EXISTS public.vector_l2_squared_distance(vector, vector);
DROP FUNCTION IF EXISTS public.vector_negative_inner_product(vector, vector);
DROP FUNCTION IF EXISTS public.vector_spherical_distance(vector, vector);