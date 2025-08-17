-- Drop all RLS policies that depend on user_id columns
DROP POLICY IF EXISTS "Users can view deliberations they participate in" ON deliberations;
DROP POLICY IF EXISTS "Users can view public deliberations" ON deliberations;
DROP POLICY IF EXISTS "Admins can view all deliberations" ON deliberations;
DROP POLICY IF EXISTS "Users can only view their own messages" ON messages;
DROP POLICY IF EXISTS "Users can create messages as themselves" ON messages;
DROP POLICY IF EXISTS "Anyone can join as participant" ON participants;
DROP POLICY IF EXISTS "Users can leave deliberations" ON participants;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view non-archived profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can archive profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles including archived" ON profiles;