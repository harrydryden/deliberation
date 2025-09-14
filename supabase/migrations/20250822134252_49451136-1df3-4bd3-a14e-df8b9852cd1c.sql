-- Clean up the duplicate admin role for user 2caf324a-524f-49d7-bc0a-5f3404f68f06
DELETE FROM public.user_roles 
WHERE user_id = '2caf324a-524f-49d7-bc0a-5f3404f68f06' 
  AND role = 'admin'::app_role;