-- Add column to track if message has been submitted to IBIS
ALTER TABLE public.messages ADD COLUMN submitted_to_ibis BOOLEAN DEFAULT false;

-- Add updated_at trigger for messages if it doesn't exist
DROP TRIGGER IF EXISTS update_messages_updated_at ON public.messages;
CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();