-- Create an admin user for testing
-- First, let's see what users exist in the auth.users table

-- Insert a test admin user directly into profiles table and user_roles
INSERT INTO profiles (id, created_at, updated_at, is_archived) 
VALUES ('12345678-1234-1234-1234-123456789012', NOW(), NOW(), false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role, created_at)
VALUES ('12345678-1234-1234-1234-123456789012', 'admin', NOW())
ON CONFLICT (user_id, role) DO NOTHING;

-- Let's also create a test admin account that can be used for testing
-- We'll use a predictable UUID for admin testing
INSERT INTO profiles (id, created_at, updated_at, is_archived, migrated_from_access_code) 
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', NOW(), NOW(), false, 'admin-test@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role, created_at)
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'admin', NOW())
ON CONFLICT (user_id, role) DO NOTHING;