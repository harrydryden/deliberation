-- Drop all role escalation triggers
DROP TRIGGER IF EXISTS prevent_role_escalation ON profiles;
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON profiles;

-- Now update the user role
UPDATE profiles 
SET role = 'admin', user_role = 'admin' 
WHERE id = 'd25d63bc-663e-4c83-a4c1-e903f78ae84e';

UPDATE user_cache 
SET user_role = 'admin' 
WHERE id = 'd25d63bc-663e-4c83-a4c1-e903f78ae84e';

-- Fix the access code assignment
UPDATE access_codes 
SET used_by = 'd25d63bc-663e-4c83-a4c1-e903f78ae84e', 
    used_at = now()
WHERE code = '0000000004';

-- Recreate the trigger with the correct name
CREATE TRIGGER prevent_role_escalation_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION prevent_role_escalation();