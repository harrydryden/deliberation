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

// Proper CSV parser that handles quoted fields with commas
function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < row.length) {
    const char = row[i];
    
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add the last field
  result.push(current.trim());
  
  return result;
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

    // Initialize admin client for user validation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

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

    // Parse CSV data with proper quoted field handling
    const lines = csvData.trim().split('\n');
    const headers = parseCSVRow(lines[0]);
    
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

    // Parse CSV rows with proper handling of quoted fields
    const csvRows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVRow(lines[i]);
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
      return new Response(JSON.stringify({ 
        error: 'Error validating participants', 
        details: participantsError.message,
        user_ids_checked: uniqueUserIds
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const participantUserIds = participants?.map(p => p.user_id) || [];
    const missingUsers = uniqueUserIds.filter(id => !participantUserIds.includes(id));

    if (missingUsers.length > 0) {
      console.error('Missing users not in deliberation:', missingUsers);
      return new Response(JSON.stringify({ 
        error: 'Some users are not participants in this deliberation',
        missing_users: missingUsers,
        found_participants: participantUserIds,
        all_csv_users: uniqueUserIds
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

    // Process messages sequentially with immediate agent responses
    let importedCount = 0;
    let failedCount = 0;
    let agentResponseCount = 0;

    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      console.log(`Processing message ${i + 1}/${csvRows.length}: ${row.content.substring(0, 50)}...`);
      
      try {
        // Insert user message using admin client to bypass RLS
        const { data: insertedMessage, error: insertError } = await supabaseAdmin
          .from('messages')
          .insert({
            content: row.content,
            user_id: row.user_id,
            deliberation_id: deliberationId,
            message_type: 'user' as const,
            bulk_import_status: 'processing' as const,
            created_at: row.created_at
          })
          .select('id')
          .single();

        if (insertError || !insertedMessage) {
          console.error(`Error inserting message ${i + 1}:`, insertError);
          failedCount++;
          continue;
        }

        importedCount++;
        console.log(`✅ Imported user message ${insertedMessage.id}`);

        // Generate agent response immediately (not in background for now)
        try {
          console.log(`🤖 Generating agent response for message ${insertedMessage.id}...`);
          
          const { error: agentError } = await supabase.functions.invoke(
            'agent-orchestration-stream',
            {
              headers: { authorization: req.headers.get('authorization') },
              body: {
                messageId: insertedMessage.id,
                deliberationId: deliberationId,
                mode: 'bulk_processing'
              }
            }
          );

          if (agentError) {
            console.error(`Agent response failed for message ${insertedMessage.id}:`, agentError);
            await supabaseAdmin
              .from('messages')
              .update({ bulk_import_status: 'failed' })
              .eq('id', insertedMessage.id);
          } else {
            // Wait briefly and verify response was created
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const { data: responseCheck } = await supabaseAdmin
              .from('messages')
              .select('id')
              .eq('deliberation_id', deliberationId)
              .eq('parent_message_id', insertedMessage.id)
              .neq('message_type', 'user')
              .limit(1);
            
            if (responseCheck && responseCheck.length > 0) {
              console.log(`✅ Agent response created for message ${insertedMessage.id}`);
              agentResponseCount++;
              await supabaseAdmin
                .from('messages')
                .update({ bulk_import_status: 'agent_response_generated' })
                .eq('id', insertedMessage.id);
            } else {
              console.error(`❌ Agent response verification failed for message ${insertedMessage.id}`);
              await supabaseAdmin
                .from('messages')
                .update({ bulk_import_status: 'failed' })
                .eq('id', insertedMessage.id);
            }
          }
        } catch (agentResponseError) {
          console.error(`Error generating agent response for ${insertedMessage.id}:`, agentResponseError);
          await supabaseAdmin
            .from('messages')
            .update({ bulk_import_status: 'failed' })
            .eq('id', insertedMessage.id);
        }

      } catch (error) {
        console.error(`Error processing message ${i + 1}:`, error);
        failedCount++;
      }

      // Update batch progress every 5 messages
      if ((i + 1) % 5 === 0 || i === csvRows.length - 1) {
        await supabaseAdmin
          .from('bulk_import_batches')
          .update({
            imported_messages: importedCount,
            failed_messages: failedCount,
            processed_messages: agentResponseCount
          })
          .eq('id', batch.id);
      }

      // Rate limiting between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update final batch status - agent responses are handled in background
    const finalStatus = failedCount === 0 ? 'completed' : (importedCount > 0 ? 'completed' : 'failed');
    await supabaseAdmin
      .from('bulk_import_batches')
      .update({
        import_status: finalStatus,
        processing_log: [
          {
            timestamp: new Date().toISOString(),
            action: 'import_completed_with_agent_responses',
            details: { 
              imported: importedCount, 
              failed: failedCount,
              note: 'Agent responses are being generated in background'
            }
          }
        ]
      })
      .eq('id', batch.id);

    console.log(`Import completed with agent response generation in progress. Imported: ${importedCount}, Failed: ${failedCount}`);

    return new Response(JSON.stringify({
      success: true,
      batch_id: batch.id,
      total_messages: csvRows.length,
      imported_messages: importedCount,
      failed_messages: failedCount,
      message: `Successfully imported ${importedCount} of ${csvRows.length} messages with agent responses generating automatically`
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