-- Add archiving fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN is_archived BOOLEAN DEFAULT false,
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN archived_by UUID,
ADD COLUMN archive_reason TEXT;

-- Create index for performance on archived users queries
CREATE INDEX idx_profiles_is_archived ON public.profiles(is_archived);

-- Update RLS policies to exclude archived users from normal operations
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Temporary admin access to profiles" ON public.profiles;

-- Create new policies that handle archived users properly
CREATE POLICY "Users can view non-archived profiles" 
ON public.profiles 
FOR SELECT 
USING (NOT is_archived OR is_archived IS NULL);

CREATE POLICY "Admins can view all profiles including archived" 
ON public.profiles 
FOR SELECT 
USING (get_current_user_role() = 'admin');

CREATE POLICY "Admins can archive profiles" 
ON public.profiles 
FOR UPDATE 
USING (get_current_user_role() = 'admin')
WITH CHECK (get_current_user_role() = 'admin');

-- Drop the temporary delete policy
DROP POLICY IF EXISTS "Temporary admin delete policy" ON public.profiles;

-- Create audit function for archiving
CREATE OR REPLACE FUNCTION public.audit_user_archiving()
RETURNS TRIGGER AS $$
BEGIN
    -- Log when a user is archived or unarchived
    IF OLD.is_archived IS DISTINCT FROM NEW.is_archived THEN
        PERFORM audit_sensitive_operation(
            CASE WHEN NEW.is_archived THEN 'user_archived' ELSE 'user_unarchived' END,
            'profiles',
            NEW.id,
            jsonb_build_object(
                'was_archived', OLD.is_archived,
                'now_archived', NEW.is_archived,
                'archived_by', NEW.archived_by,
                'archive_reason', NEW.archive_reason,
                'archived_at', NEW.archived_at
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;