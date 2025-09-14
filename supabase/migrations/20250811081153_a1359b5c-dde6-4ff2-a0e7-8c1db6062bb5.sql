-- Add RLS policy to allow viewing participant counts for public deliberations
CREATE POLICY "Anyone can view participant counts for public deliberations"
ON public.participants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.deliberations 
    WHERE deliberations.id = participants.deliberation_id 
    AND deliberations.is_public = true
  )
);