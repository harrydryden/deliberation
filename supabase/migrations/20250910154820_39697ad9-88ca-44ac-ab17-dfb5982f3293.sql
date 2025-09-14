-- Fix typos in agent response_style configurations: change "no more that" to "no more than"
UPDATE agent_configurations 
SET response_style = REPLACE(response_style, 'no more that 240', 'no more than 240')
WHERE response_style LIKE '%no more that 240%';