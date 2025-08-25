// Test script for the robust-pdf-processor edge function
import { createClient } from '@supabase/supabase-js';

// Test configuration
const SUPABASE_URL = 'https://iowsxuxkgvpgrvvklwyt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM';

async function testEdgeFunction() {
  try {
    console.log('Testing robust-pdf-processor edge function...');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Test with a simple request
    const response = await supabase.functions.invoke('robust-pdf-processor', {
      body: {
        fileUrl: 'https://example.com/test.pdf',
        fileName: 'test.pdf',
        deliberationId: 'test-deliberation',
        userId: 'test-user'
      }
    });
    
    console.log('Response:', response);
    
    if (response.error) {
      console.error('Error:', response.error);
    } else {
      console.log('Success:', response.data);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testEdgeFunction();
