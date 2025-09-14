-- Temporarily disable the role escalation trigger
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON profiles;

-- Fix admin users who have admin access codes but wrong role
UPDATE profiles 
SET role = 'admin' 
WHERE id IN (
  SELECT p.id 
  FROM profiles p
  JOIN access_codes ac ON ac.used_by = p.id
  WHERE ac.code_type = 'admin'
);

-- Also ensure the old user_role field is properly synced for consistency
UPDATE profiles 
SET user_role = role;

-- Re-enable the role escalation trigger
CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();