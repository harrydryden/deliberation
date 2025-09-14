-- Get the current definition of the user_cache view
SELECT pg_get_viewdef('public.user_cache'::regclass, true) AS view_definition;