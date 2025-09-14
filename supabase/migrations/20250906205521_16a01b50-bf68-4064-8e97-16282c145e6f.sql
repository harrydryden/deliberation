-- Delete all auth users except the admin user
DELETE FROM auth.users 
WHERE id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';

-- Clean up any orphaned data from other tables
DELETE FROM profiles WHERE id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';
DELETE FROM participants WHERE user_id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';
DELETE FROM messages WHERE user_id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';
DELETE FROM user_sessions WHERE user_id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';
DELETE FROM user_activity_logs WHERE user_id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';
DELETE FROM agent_ratings WHERE user_id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';
DELETE FROM user_stance_scores WHERE user_id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';
DELETE FROM facilitator_sessions WHERE user_id != '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';