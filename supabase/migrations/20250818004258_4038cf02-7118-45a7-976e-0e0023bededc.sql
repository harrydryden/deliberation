-- Drop the old function with display_name parameter
DROP FUNCTION IF EXISTS public.create_user_with_access_code(text, text);

-- Keep only the current function without display_name parameter
-- This function already exists and is correct, so no need to recreate it

-- Verify the function exists
SELECT proname, pronargs, pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'create_user_with_access_code' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');