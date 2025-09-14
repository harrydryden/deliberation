-- Fix the naming mismatch for voice templates
UPDATE prompt_templates SET name = 'voice_interface_short' WHERE name = 'voice_assistant_short';
UPDATE prompt_templates SET name = 'voice_interface_medium' WHERE name = 'voice_assistant_medium';
UPDATE prompt_templates SET name = 'voice_interface_long' WHERE name = 'voice_assistant_long';
UPDATE prompt_templates SET name = 'voice_interface_fallback' WHERE name = 'voice_assistant_fallback';