// Simple test to check edge function accessibility
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iowsxuxkgvpgrvvklwyt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM';

async function testFunction() {
  try {
    console.log('Testing edge function accessibility...');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Test 1: Check if function exists (should return 401 without auth, not 404)
    console.log('\n1. Testing function existence (no auth)...');
    try {
      const response = await supabase.functions.invoke('robust-pdf-processor', {
        body: { test: 'data' }
      });
      console.log('Unexpected success:', response);
    } catch (error) {
      if (error.message.includes('401')) {
        console.log('✅ Function exists but requires auth (expected)');
      } else if (error.message.includes('404')) {
        console.log('❌ Function does not exist (404)');
      } else {
        console.log('⚠️ Unexpected error:', error.message);
      }
    }
    
    // Test 2: Check with minimal valid request
    console.log('\n2. Testing with minimal valid request...');
    try {
      const response = await supabase.functions.invoke('robust-pdf-processor', {
        body: {
          fileUrl: 'https://example.com/test.pdf',
          fileName: 'test.pdf',
          deliberationId: 'test',
          userId: 'test'
        }
      });
      console.log('✅ Function working:', response);
    } catch (error) {
      console.log('❌ Function error:', error.message);
      if (error.context) {
        console.log('Error context:', error.context);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testFunction();
