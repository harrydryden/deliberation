-- Fix existing participant records that have access codes instead of UUIDs
-- Update participant records to use proper UUIDs from access_codes table

UPDATE participants 
SET user_id = ac.used_by::text
FROM access_codes ac
WHERE participants.user_id = ('access_' || ac.code)
  AND ac.is_active = true 
  AND ac.is_used = true
  AND ac.used_by IS NOT NULL;

-- This will convert any existing participant records from 'access_XXXX' format to proper UUIDs