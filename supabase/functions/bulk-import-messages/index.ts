import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CSVRow {
  content: string;
  user_id: string;
  created_at?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header to verify admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.user_role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { deliberationId, csvData, filename } = await req.json();

    if (!deliberationId || !csvData || !filename) {
      return new Response(JSON.stringify({ error: 'Missing required fields: deliberationId, csvData, filename' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting bulk import for deliberation: ${deliberationId}, file: ${filename}`);

    // Verify deliberation exists
    const { data: deliberation, error: deliberationError } = await supabase
      .from('deliberations')
      .select('id, title')
      .eq('id', deliberationId)
      .single();

    if (deliberationError || !deliberation) {
      return new Response(JSON.stringify({ error: 'Deliberation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse CSV data
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
    
    console.log('CSV Headers:', headers);

    if (!headers.includes('content') || !headers.includes('user_id')) {
      return new Response(JSON.stringify({ 
        error: 'CSV must contain "content" and "user_id" columns',
        found_headers: headers 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse CSV rows
    const csvRows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v: string) => v.trim().replace(/"/g, ''));
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      if (row.content && row.user_id) {
        csvRows.push({
          content: row.content,
          user_id: row.user_id,
          created_at: row.created_at || new Date().toISOString()
        });
      }
    }

    console.log(`Parsed ${csvRows.length} rows from CSV`);

    if (csvRows.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid rows found in CSV' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get unique user IDs from CSV
    const uniqueUserIds = [...new Set(csvRows.map(row => row.user_id))];
    console.log(`Found ${uniqueUserIds.length} unique users`);

    // Verify all users exist and are participants in the deliberation
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select('user_id')
      .eq('deliberation_id', deliberationId)
      .in('user_id', uniqueUserIds);

    if (participantsError) {
      console.error('Error checking participants:', participantsError);
      return new Response(JSON.stringify({ error: 'Error validating participants' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const participantUserIds = participants?.map(p => p.user_id) || [];
    const missingUsers = uniqueUserIds.filter(id => !participantUserIds.includes(id));

    if (missingUsers.length > 0) {
      return new Response(JSON.stringify({ 
        error: 'Some users are not participants in this deliberation',
        missing_users: missingUsers
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create import batch record
    const { data: batch, error: batchError } = await supabase
      .from('bulk_import_batches')
      .insert({
        deliberation_id: deliberationId,
        created_by: user.id,
        filename: filename,
        total_messages: csvRows.length,
        import_status: 'importing'
      })
      .select('id')
      .single();

    if (batchError || !batch) {
      console.error('Error creating batch:', batchError);
      return new Response(JSON.stringify({ error: 'Failed to create import batch' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Created batch ${batch.id}, importing ${csvRows.length} messages`);

    // Sort messages by created_at to maintain chronological order
    csvRows.sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

    // Import messages in chunks
    let importedCount = 0;
    let failedCount = 0;
    const chunkSize = 100;

    for (let i = 0; i < csvRows.length; i += chunkSize) {
      const chunk = csvRows.slice(i, i + chunkSize);
      
      const messagesToInsert = chunk.map(row => ({
        content: row.content,
        user_id: row.user_id,
        deliberation_id: deliberationId,
        message_type: 'user' as const,
        bulk_import_status: 'awaiting_agent_response' as const,
        created_at: row.created_at
      }));

      const { data: insertedMessages, error: insertError } = await supabase
        .from('messages')
        .insert(messagesToInsert)
        .select('id');

      if (insertError) {
        console.error(`Error inserting chunk ${i / chunkSize + 1}:`, insertError);
        failedCount += chunk.length;
      } else {
        importedCount += insertedMessages?.length || 0;
      }

      // Update batch progress
      await supabase
        .from('bulk_import_batches')
        .update({
          imported_messages: importedCount,
          failed_messages: failedCount
        })
        .eq('id', batch.id);
    }

    // Update final batch status
    const finalStatus = failedCount === 0 ? 'imported' : (importedCount > 0 ? 'imported' : 'failed');
    await supabase
      .from('bulk_import_batches')
      .update({
        import_status: finalStatus,
        processing_log: [
          {
            timestamp: new Date().toISOString(),
            action: 'import_completed',
            details: { imported: importedCount, failed: failedCount }
          }
        ]
      })
      .eq('id', batch.id);

    console.log(`Import completed. Imported: ${importedCount}, Failed: ${failedCount}`);

    return new Response(JSON.stringify({
      success: true,
      batch_id: batch.id,
      total_messages: csvRows.length,
      imported_messages: importedCount,
      failed_messages: failedCount,
      message: `Successfully imported ${importedCount} of ${csvRows.length} messages`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in bulk-import-messages function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});