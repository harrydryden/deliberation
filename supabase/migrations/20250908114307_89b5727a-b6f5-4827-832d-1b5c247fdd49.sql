-- Drop bulk import functionality
-- Remove bulk_import_status column from messages table
ALTER TABLE messages DROP COLUMN IF EXISTS bulk_import_status;

-- Drop bulk_import_batches table and related objects
DROP TABLE IF EXISTS bulk_import_batches CASCADE;

-- Drop related indexes if they exist
DROP INDEX IF EXISTS idx_bulk_import_batches_deliberation_id;
DROP INDEX IF EXISTS idx_bulk_import_batches_status;
DROP INDEX IF EXISTS idx_messages_bulk_import_status;