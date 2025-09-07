-- Reset messages from previous batch to allow reprocessing with correct timestamps
UPDATE messages 
SET bulk_import_status = 'awaiting_agent_response'
WHERE deliberation_id = 'dd21813f-8935-40f3-b352-55a4491dd584'
  AND message_type = 'user' 
  AND bulk_import_status IN ('agent_response_generated', 'completed');

-- Delete agent responses with incorrect timestamps (they'll be regenerated in correct order)
DELETE FROM messages 
WHERE deliberation_id = 'dd21813f-8935-40f3-b352-55a4491dd584'
  AND message_type != 'user' 
  AND created_at > '2025-09-01';  -- Delete recent agent responses only