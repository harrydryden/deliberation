-- Phase 3: Fix Function Search Path Performance Issue (WARN 1)
-- Update functions that don't have proper search_path set to improve query performance

-- Fix functions with mutable search paths that could cause performance issues
ALTER FUNCTION public.vector_dims(vector) SET search_path = 'public';
ALTER FUNCTION public.vector_norm(vector) SET search_path = 'public';
ALTER FUNCTION public.l2_normalize(vector) SET search_path = 'public';
ALTER FUNCTION public.binary_quantize(vector) SET search_path = 'public';
ALTER FUNCTION public.subvector(vector, integer, integer) SET search_path = 'public';
ALTER FUNCTION public.vector_add(vector, vector) SET search_path = 'public';
ALTER FUNCTION public.vector_sub(vector, vector) SET search_path = 'public';
ALTER FUNCTION public.vector_mul(vector, vector) SET search_path = 'public';
ALTER FUNCTION public.vector_concat(vector, vector) SET search_path = 'public';
ALTER FUNCTION public.inner_product(vector, vector) SET search_path = 'public';
ALTER FUNCTION public.cosine_distance(vector, vector) SET search_path = 'public';
ALTER FUNCTION public.l1_distance(vector, vector) SET search_path = 'public';
ALTER FUNCTION public.l2_distance(vector, vector) SET search_path = 'public';

-- Fix halfvec functions
ALTER FUNCTION public.vector_dims(halfvec) SET search_path = 'public';
ALTER FUNCTION public.l2_norm(halfvec) SET search_path = 'public';
ALTER FUNCTION public.l2_normalize(halfvec) SET search_path = 'public';
ALTER FUNCTION public.binary_quantize(halfvec) SET search_path = 'public';
ALTER FUNCTION public.subvector(halfvec, integer, integer) SET search_path = 'public';
ALTER FUNCTION public.inner_product(halfvec, halfvec) SET search_path = 'public';
ALTER FUNCTION public.cosine_distance(halfvec, halfvec) SET search_path = 'public';
ALTER FUNCTION public.l1_distance(halfvec, halfvec) SET search_path = 'public';
ALTER FUNCTION public.l2_distance(halfvec, halfvec) SET search_path = 'public';

-- Fix sparsevec functions
ALTER FUNCTION public.l2_norm(sparsevec) SET search_path = 'public';
ALTER FUNCTION public.l2_normalize(sparsevec) SET search_path = 'public';
ALTER FUNCTION public.inner_product(sparsevec, sparsevec) SET search_path = 'public';
ALTER FUNCTION public.cosine_distance(sparsevec, sparsevec) SET search_path = 'public';
ALTER FUNCTION public.l1_distance(sparsevec, sparsevec) SET search_path = 'public';
ALTER FUNCTION public.l2_distance(sparsevec, sparsevec) SET search_path = 'public';

-- Fix other vector utility functions
ALTER FUNCTION public.hamming_distance(bit, bit) SET search_path = 'public';
ALTER FUNCTION public.jaccard_distance(bit, bit) SET search_path = 'public';