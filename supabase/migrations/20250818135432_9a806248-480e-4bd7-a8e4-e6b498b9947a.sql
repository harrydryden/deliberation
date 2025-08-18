-- Fix RLS policies and schema issues for profiles and user_roles

-- First, let's check and fix the profiles table RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile only" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;

-- Create proper RLS policies for profiles
CREATE POLICY "Service role can manage profiles" 
ON profiles FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Users can insert their own profile" 
ON profiles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view their own profile" 
ON profiles FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- Allow authenticated users to view all profiles (needed for admin functionality)
CREATE POLICY "Authenticated users can view all profiles" 
ON profiles FOR SELECT 
TO authenticated 
USING (true);

-- Fix user_roles policies
DROP POLICY IF EXISTS "Service role can manage user_roles" ON user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Users can view their own roles only" ON user_roles;

CREATE POLICY "Service role can manage user_roles" 
ON user_roles FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Users can view their own roles" 
ON user_roles FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert user roles" 
ON user_roles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';