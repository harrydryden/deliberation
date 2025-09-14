-- Delete the generic template to avoid confusion
DELETE FROM prompt_templates 
WHERE name = 'generate_issue_recommendations' AND is_active = true