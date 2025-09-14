-- Update existing access codes to remove the max_uses limit
UPDATE access_codes 
SET max_uses = NULL 
WHERE max_uses = 1;