-- Drop views that depend on the columns we need to change
DROP VIEW IF EXISTS user_profiles_with_codes CASCADE;
DROP VIEW IF EXISTS user_profiles_with_deliberations CASCADE;
DROP VIEW IF EXISTS notions CASCADE;
DROP VIEW IF EXISTS user_cache CASCADE;