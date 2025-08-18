-- Fix the foreign key relationship between deliberations and participants
-- and ensure all RLS policies work with proper UUID conversion

-- Add foreign key constraint between deliberations and participants if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'participants_deliberation_id_fkey' 
        AND table_name = 'participants'
    ) THEN
        ALTER TABLE public.participants 
        ADD CONSTRAINT participants_deliberation_id_fkey 
        FOREIGN KEY (deliberation_id) REFERENCES public.deliberations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Fix ibis_nodes RLS policies to properly handle UUID conversion  
DROP POLICY IF EXISTS "Access code users can view IBIS nodes in their deliberations" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Access code users can create IBIS nodes in their deliberations" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Users can view IBIS nodes in their deliberations" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Users can create IBIS nodes in their deliberations" ON public.ibis_nodes;

CREATE POLICY "Users can view IBIS nodes in their deliberations"
ON public.ibis_nodes
FOR SELECT
USING (
  deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = (get_current_access_code_user())::text
  )
);

CREATE POLICY "Users can create IBIS nodes in their deliberations"
ON public.ibis_nodes
FOR INSERT
WITH CHECK (
  deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = (get_current_access_code_user())::text
  ) AND created_by = get_current_access_code_user()
);