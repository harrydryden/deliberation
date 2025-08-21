-- Optimize access codes and remove unused fields
-- Migration: 20250821182543_optimize_access_codes

-- 1. Drop the unused access_codes table
DROP TABLE IF EXISTS access_codes CASCADE;

-- 2. Remove the deprecated access_code field from users table
ALTER TABLE users DROP COLUMN IF EXISTS access_code;

-- 3. Add optimized access code fields to profiles table if they don't exist
DO $$ 
BEGIN
    -- Add access_code_1 field (5 characters max)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'access_code_1') THEN
        ALTER TABLE profiles ADD COLUMN access_code_1 VARCHAR(5);
    END IF;
    
    -- Add access_code_2 field (6 characters max)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'access_code_2') THEN
        ALTER TABLE profiles ADD COLUMN access_code_2 VARCHAR(6);
    END IF;
    
    -- Add role field if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE profiles ADD COLUMN role VARCHAR(20) DEFAULT 'user';
    END IF;
    
    -- Add archive fields if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_archived') THEN
        ALTER TABLE profiles ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'archived_at') THEN
        ALTER TABLE profiles ADD COLUMN archived_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'archived_by') THEN
        ALTER TABLE profiles ADD COLUMN archived_by UUID;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'archive_reason') THEN
        ALTER TABLE profiles ADD COLUMN archive_reason TEXT;
    END IF;
END $$;

-- 4. Remove migration-related fields that are no longer used
ALTER TABLE profiles DROP COLUMN IF EXISTS migrated_from_access_code;
ALTER TABLE profiles DROP COLUMN IF EXISTS original_access_code_id;

-- 5. Create indexes for better performance on access code fields
CREATE INDEX IF NOT EXISTS idx_profiles_access_code_1 ON profiles(access_code_1);
CREATE INDEX IF NOT EXISTS idx_profiles_access_code_2 ON profiles(access_code_2);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_archived ON profiles(is_archived);

-- 6. Add constraints to ensure data integrity
ALTER TABLE profiles ADD CONSTRAINT chk_access_code_1_format CHECK (access_code_1 IS NULL OR access_code_1 ~ '^[A-Z]{5}$');
ALTER TABLE profiles ADD CONSTRAINT chk_access_code_2_format CHECK (access_code_2 IS NULL OR access_code_2 ~ '^\d{6}$');
ALTER TABLE profiles ADD CONSTRAINT chk_role_values CHECK (role IN ('user', 'admin', 'moderator'));

-- 7. Update existing profiles to ensure role is set
UPDATE profiles SET role = 'user' WHERE role IS NULL;

-- Migration completed successfully
