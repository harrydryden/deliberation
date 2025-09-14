-- Update Flo agent's max_response_characters from 500 to 1500
UPDATE agent_configurations 
SET max_response_characters = 1500 
WHERE name = 'Flo.' AND max_response_characters = 500;