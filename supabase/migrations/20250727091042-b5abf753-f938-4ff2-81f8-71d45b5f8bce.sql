-- Fix the profile for the new user to be admin
UPDATE public.profiles 
SET user_role = 'admin', updated_at = now()
WHERE id = '1754a99d-2308-4b9c-ad02-bf943018237d';