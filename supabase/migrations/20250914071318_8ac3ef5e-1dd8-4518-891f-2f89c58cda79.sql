-- Reset circuit breakers for AI functions
UPDATE circuit_breaker_state 
SET 
  failure_count = 0, 
  is_open = false, 
  updated_at = NOW() 
WHERE id IN ('relationship_evaluation', 'issue_recommendations');