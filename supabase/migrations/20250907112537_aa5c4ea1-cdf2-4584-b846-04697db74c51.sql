-- Create table for message processing locks to prevent concurrent agent responses
CREATE TABLE IF NOT EXISTS public.message_processing_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  processing_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_message_processing_locks_message_id FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_message_processing_locks_message_id ON public.message_processing_locks(message_id);
CREATE INDEX IF NOT EXISTS idx_message_processing_locks_expires_at ON public.message_processing_locks(expires_at);

-- Enable RLS for security
ALTER TABLE public.message_processing_locks ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to manage locks
CREATE POLICY "Service role can manage processing locks" 
ON public.message_processing_locks 
FOR ALL 
TO service_role 
USING (true);

-- Function to clean up expired locks (called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_processing_locks()
RETURNS void AS $$
BEGIN
  DELETE FROM public.message_processing_locks 
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;