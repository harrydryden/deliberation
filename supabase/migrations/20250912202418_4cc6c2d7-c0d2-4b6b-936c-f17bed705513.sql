-- Create database function to validate message authorship against participant records
CREATE OR REPLACE FUNCTION public.validate_message_authorship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only validate for messages with deliberation_id
  IF NEW.deliberation_id IS NOT NULL THEN
    -- Check if user is a participant in the deliberation
    IF NOT EXISTS (
      SELECT 1 FROM participants 
      WHERE user_id = NEW.user_id 
      AND deliberation_id = NEW.deliberation_id
    ) THEN
      -- Check if user is admin (admins can create messages in any deliberation)
      IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = NEW.user_id::uuid 
        AND user_role = 'admin'::app_role
      ) THEN
        RAISE EXCEPTION 'User % is not authorized to create messages in deliberation %', 
          NEW.user_id, NEW.deliberation_id;
      END IF;
    END IF;
  END IF;
  
  -- Log the validation for audit purposes
  INSERT INTO audit_logs (
    action,
    table_name,
    record_id,
    user_id,
    new_values
  ) VALUES (
    'message_authorship_validated',
    'messages',
    NEW.id,
    NEW.user_id::uuid,
    jsonb_build_object(
      'deliberation_id', NEW.deliberation_id,
      'message_type', NEW.message_type,
      'validation_timestamp', now()
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to validate message authorship before insert
DROP TRIGGER IF EXISTS validate_message_authorship_trigger ON messages;
CREATE TRIGGER validate_message_authorship_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION validate_message_authorship();

-- Create function to detect user attribution anomalies
CREATE OR REPLACE FUNCTION public.detect_user_attribution_anomalies(
  p_user_id uuid,
  p_deliberation_id uuid DEFAULT NULL,
  p_time_window_minutes integer DEFAULT 5
)
RETURNS TABLE(
  anomaly_type text,
  message_id uuid,
  created_at timestamp with time zone,
  details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check for messages created by user who is not a participant
  RETURN QUERY
  SELECT 
    'unauthorized_participation'::text as anomaly_type,
    m.id as message_id,
    m.created_at,
    jsonb_build_object(
      'user_id', m.user_id,
      'deliberation_id', m.deliberation_id,
      'is_participant', EXISTS(
        SELECT 1 FROM participants p 
        WHERE p.user_id = m.user_id 
        AND p.deliberation_id = m.deliberation_id
      ),
      'is_admin', EXISTS(
        SELECT 1 FROM profiles pr 
        WHERE pr.id = m.user_id::uuid 
        AND pr.user_role = 'admin'::app_role
      )
    ) as details
  FROM messages m
  WHERE m.user_id = p_user_id::text
    AND (p_deliberation_id IS NULL OR m.deliberation_id = p_deliberation_id)
    AND m.created_at >= now() - (p_time_window_minutes || ' minutes')::interval
    AND m.deliberation_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM participants p 
      WHERE p.user_id = m.user_id 
      AND p.deliberation_id = m.deliberation_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM profiles pr 
      WHERE pr.id = m.user_id::uuid 
      AND pr.user_role = 'admin'::app_role
    );
END;
$$;

-- Add constraint to ensure user_id format is valid UUID
ALTER TABLE messages 
ADD CONSTRAINT valid_user_id_format 
CHECK (user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Create index for faster user attribution queries
CREATE INDEX IF NOT EXISTS idx_messages_user_deliberation_created 
ON messages(user_id, deliberation_id, created_at);

-- Create index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp 
ON audit_logs(action, created_at);