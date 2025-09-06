-- Check if pgcrypto extension is properly installed
SELECT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
) as pgcrypto_installed;

-- Try to enable it in the extensions schema instead
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Test if gen_salt function is now available
SELECT gen_salt('bf') as test_salt;