-- Replace the trigger function to allow bootstrap admin setup
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow role changes if no admin exists yet (bootstrap case)
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
        RETURN NEW;
    END IF;
    
    -- If role is being changed
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Only allow if current user is admin
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only administrators can change user roles';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

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