-- Fix the search_path warning for the vector function
CREATE OR REPLACE FUNCTION public.vector_combine(double precision[], double precision[])
RETURNS double precision[]
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
SET search_path = public
AS '$libdir/vector', 'vector_combine';