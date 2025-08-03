// Enhanced secure file processing edge function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessingRequest {
  storagePath: string;
  fileName: string;
  agentId: string;
  contentType: 'pdf' | 'text';
  securityContext?: {
    fingerprint: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

interface SecurityValidation {
  isValid: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  issues: string[];
  quarantine?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Get user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const request: ProcessingRequest = await req.json();
    console.log('🔒 Processing file with enhanced security:', { 
      file: request.fileName, 
      user: user.id,
      agent: request.agentId 
    });

    // Step 1: Security validation
    const securityValidation = await performSecurityValidation(
      supabaseClient,
      request,
      user.id
    );

    if (!securityValidation.isValid) {
      // Log security violation
      await logSecurityEvent(supabaseClient, {
        event_type: 'file_processing_blocked',
        user_id: user.id,
        details: {
          fileName: request.fileName,
          issues: securityValidation.issues,
          riskLevel: securityValidation.riskLevel
        },
        risk_level: securityValidation.riskLevel
      });

      if (securityValidation.quarantine) {
        // Move file to quarantine
        await quarantineFile(supabaseClient, request.storagePath, user.id);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'File processing blocked due to security concerns',
          issues: securityValidation.issues
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403
        }
      );
    }

    // Step 2: Create processing log
    const processingLogId = await createProcessingLog(supabaseClient, {
      user_id: user.id,
      file_name: request.fileName,
      file_type: request.contentType,
      processing_status: 'processing',
      security_scan_status: 'clean'
    });

    try {
      // Step 3: Download and scan file
      const { data: fileData, error: downloadError } = await supabaseClient.storage
        .from('documents')
        .download(request.storagePath);

      if (downloadError) {
        throw new Error(`File download failed: ${downloadError.message}`);
      }

      // Step 4: Content scanning
      const contentScan = await scanFileContent(fileData, request.contentType);
      if (!contentScan.safe) {
        await updateProcessingLog(supabaseClient, processingLogId, {
          processing_status: 'failed',
          security_scan_status: 'malicious',
          error_details: { contentScanIssues: contentScan.issues }
        });

        throw new Error('Malicious content detected in file');
      }

      // Step 5: Process with LangChain (existing logic)
      const processingResult = await processWithLangChain(
        supabaseClient,
        fileData,
        request
      );

      // Step 6: Update logs with success
      await updateProcessingLog(supabaseClient, processingLogId, {
        processing_status: 'completed',
        security_scan_status: 'clean'
      });

      // Log successful processing
      await logSecurityEvent(supabaseClient, {
        event_type: 'file_processed_successfully',
        user_id: user.id,
        details: {
          fileName: request.fileName,
          agentId: request.agentId,
          chunksCreated: processingResult.chunksCreated
        },
        risk_level: 'low'
      });

      return new Response(
        JSON.stringify({
          success: true,
          result: processingResult,
          securityValidation
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processingError) {
      // Update log with failure
      await updateProcessingLog(supabaseClient, processingLogId, {
        processing_status: 'failed',
        error_details: { error: processingError.message }
      });

      throw processingError;
    }

  } catch (error) {
    console.error('🚨 File processing error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'File processing failed',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

async function performSecurityValidation(
  supabase: any,
  request: ProcessingRequest,
  userId: string
): Promise<SecurityValidation> {
  const issues: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Check file extension against filename
  const fileExt = request.fileName.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['pdf', 'txt', 'doc', 'docx'];
  
  if (!fileExt || !allowedExtensions.includes(fileExt)) {
    issues.push('Disallowed file extension');
    riskLevel = 'high';
  }

  // Check for suspicious filename patterns
  const suspiciousPatterns = [
    /\.(exe|bat|cmd|scr|pif|com|dll|vbs|js|jar)$/i,
    /[<>:"|?*]/,
    /^\./,
    /\.{2,}/
  ];

  if (suspiciousPatterns.some(pattern => pattern.test(request.fileName))) {
    issues.push('Suspicious filename pattern');
    riskLevel = 'critical';
  }

  // Check user's recent file upload history
  const { data: recentUploads } = await supabase
    .from('file_processing_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // Last hour
    .order('created_at', { ascending: false });

  if (recentUploads && recentUploads.length > 10) {
    issues.push('Excessive file uploads in short timeframe');
    riskLevel = 'medium';
  }

  // Check for recent security events from this user
  const { data: securityEvents } = await supabase
    .from('security_events')
    .select('*')
    .eq('user_id', userId)
    .in('risk_level', ['high', 'critical'])
    .gte('created_at', new Date(Date.now() - 86400000).toISOString()) // Last 24 hours
    .limit(5);

  if (securityEvents && securityEvents.length > 0) {
    issues.push('Recent high-risk security events from user');
    riskLevel = 'high';
  }

  return {
    isValid: issues.length === 0 || riskLevel !== 'critical',
    riskLevel,
    issues,
    quarantine: riskLevel === 'critical'
  };
}

async function scanFileContent(fileData: Blob, contentType: string): Promise<{
  safe: boolean;
  issues: string[];
}> {
  const issues: string[] = [];
  
  try {
    // Basic content scanning - in production you'd use more sophisticated tools
    const text = await fileData.text();
    
    // Check for embedded scripts or suspicious content
    const dangerousPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /data:text\/html/gi,
      /<%[\s\S]*?%>/g, // Server-side scripts
      /<\?php[\s\S]*?\?>/g // PHP scripts
    ];

    dangerousPatterns.forEach(pattern => {
      if (pattern.test(text)) {
        issues.push('Suspicious script content detected');
      }
    });

    // Check file size vs content ratio (potential zip bombs, etc.)
    if (text.length > fileData.size * 100) {
      issues.push('Suspicious compression ratio');
    }

  } catch (error) {
    console.error('Content scanning error:', error);
    issues.push('Failed to scan file content');
  }

  return {
    safe: issues.length === 0,
    issues
  };
}

async function processWithLangChain(
  supabase: any,
  fileData: Blob,
  request: ProcessingRequest
): Promise<any> {
  // This would contain the actual LangChain processing logic
  // For now, returning a mock result
  
  console.log('📄 Processing file with LangChain...', {
    size: fileData.size,
    type: request.contentType
  });

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    chunksCreated: Math.floor(Math.random() * 10) + 1,
    processingTime: 1000,
    status: 'completed'
  };
}

async function createProcessingLog(supabase: any, logData: any): Promise<string> {
  const { data, error } = await supabase
    .from('file_processing_logs')
    .insert(logData)
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function updateProcessingLog(supabase: any, id: string, updates: any): Promise<void> {
  const { error } = await supabase
    .from('file_processing_logs')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

async function quarantineFile(supabase: any, storagePath: string, userId: string): Promise<void> {
  const quarantinePath = `quarantine/${userId}/${Date.now()}_${storagePath.split('/').pop()}`;
  
  const { error } = await supabase.storage
    .from('documents')
    .move(storagePath, quarantinePath);

  if (error) {
    console.error('Failed to quarantine file:', error);
  }
}

async function logSecurityEvent(supabase: any, eventData: any): Promise<void> {
  const { error } = await supabase
    .from('security_events')
    .insert(eventData);

  if (error) {
    console.error('Failed to log security event:', error);
  }
}