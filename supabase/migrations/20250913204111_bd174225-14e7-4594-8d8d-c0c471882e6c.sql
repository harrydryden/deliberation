CREATE OR REPLACE FUNCTION public.reset_circuit_breaker(circuit_breaker_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Reset the specified circuit breaker
  UPDATE circuit_breaker_state 
  SET 
    failure_count = 0,
    is_open = false,
    updated_at = now()
  WHERE id = circuit_breaker_name;
  
  -- Return true if a row was updated
  RETURN FOUND;
END;
$$;