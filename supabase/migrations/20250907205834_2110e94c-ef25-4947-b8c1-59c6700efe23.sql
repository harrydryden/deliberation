-- Delete the unused fast_path_response template
DELETE FROM prompt_templates 
WHERE name = 'fast_path_response';