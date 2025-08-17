-- Change column types one by one to avoid memory issues
ALTER TABLE deliberations ALTER COLUMN facilitator_id TYPE text;
ALTER TABLE participants ALTER COLUMN user_id TYPE text;