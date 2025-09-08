import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  handleCORSPreflight
} from '../shared/edge-function-utils.ts';

serve(async (req) => {
  console.log('Test PDF Processor function called:', req.method, req.url);
  
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('Test function working');
    const body = await req.json();
    console.log('Received body:', body);

    return createSuccessResponse({
      success: true,
      message: 'Test function is working',
      receivedData: body,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Test function error:', error);
    return createErrorResponse(error, 500, 'Test PDF processor');
  }
});