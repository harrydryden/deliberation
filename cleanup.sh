#!/bin/bash

# Cleanup script for deliberation project
set -e

echo "🧹 Starting cleanup of deliberation project..."

# Create backup directory
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo " Created backup directory: $BACKUP_DIR"

# Function to safely move files to backup before deletion
backup_and_remove() {
    local file_path="$1"
    local backup_path="$BACKUP_DIR/$(dirname "$file_path")"
    
    if [ -f "$file_path" ]; then
        echo "📋 Backing up: $file_path"
        mkdir -p "$backup_path"
        cp "$file_path" "$backup_path/"
        rm "$file_path"
        echo "✅ Removed: $file_path"
    else
        echo "⚠️  File not found: $file_path"
    fi
}

echo ""
echo "️  Removing deprecated files..."

# 1. Remove deprecated hook
backup_and_remove "src/hooks/useRealtimeConnection.tsx.deprecated"

echo ""
echo "🗑️  Removing obsolete Supabase migrations..."

# 2. Remove duplicate column type change migrations
backup_and_remove "supabase/migrations/20250817233720_e7f8691e-5a36-43e7-8533-246052b68522.sql"
backup_and_remove "supabase/migrations/20250817233751_fda3f26e-7e1a-43f0-87d5-3b619c790454.sql"
backup_and_remove "supabase/migrations/20250816214422_409d8b74-0d4c-4966-b12e-69d4cd592972.sql"
backup_and_remove "supabase/migrations/20250816214130_ec9f648b-32af-40f3-b776-e63be2f75ee4.sql"

# 3. Remove access_codes related migrations (table was dropped)
backup_and_remove "supabase/migrations/20250817233641_d7e064bb-44f3-45cb-b854-c3cface6c571.sql"
backup_and_remove "supabase/migrations/20250802131410_25d0473a-5e95-4e14-ac6c-d518eb0a4d78.sql"
backup_and_remove "supabase/migrations/20250802131842_e67257f4-f862-4d9f-82b9-bf15dfa4e712.sql"
backup_and_remove "supabase/migrations/20250726192708-a810577f-f850-488b-b21a-519f30770e01.sql"
backup_and_remove "supabase/migrations/20250907143914_bf5159f5-e0e0-4392-b988-82b320c966d9.sql"

# 4. Remove redundant RLS policy cleanup migrations
backup_and_remove "supabase/migrations/20250818003802_3accdf63-c03c-4cf1-ac4e-c2c1e705b07a.sql"
backup_and_remove "supabase/migrations/20250818003536_6226a91d-041b-48f2-a0aa-da7a5daa7322.sql"

# 5. Remove obsolete system prompt migration
backup_and_remove "supabase/migrations/20250822174114_62ce2a72-ee9e-46f7-9065-4fa84ce9398e.sql"

echo ""
echo "🔍 Checking remaining files..."

# Check remaining migration files
echo " Migration files remaining:"
find supabase/migrations -name "*.sql" | wc -l

echo ""
echo "✅ Cleanup completed!"
echo "📁 Backup created in: $BACKUP_DIR"
