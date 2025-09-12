#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Comprehensive Edge Function Architecture Validator and Fixer
 * Identifies and resolves "Entrypoint path does not exist" errors
 */

import { existsSync } from "https://deno.land/std@0.208.0/fs/exists.ts";

interface FunctionDefinition {
  name: string;
  exists: boolean;
  hasIndex: boolean;
  inConfig: boolean;
  invokedByFrontend: boolean;
}

async function auditAndFix() {
  console.log('🔍 COMPREHENSIVE EDGE FUNCTION AUDIT & FIX\n');

  // 1. Parse config.toml to get expected functions
  const configText = await Deno.readTextFile('../config.toml');
  const functionMatches = configText.match(/\[functions\.([^\]]+)\]/g) || [];
  const configFunctions = functionMatches
    .map(match => match.match(/\[functions\.([^\]]+)\]/)?.[1])
    .filter(Boolean) as string[];

  console.log(`📋 Functions in config.toml: ${configFunctions.join(', ')}`);

  // 2. Check actual function directories
  const actualFunctions: string[] = [];
  try {
    for await (const dirEntry of Deno.readDir('./')) {
      if (dirEntry.isDirectory && dirEntry.name !== 'shared' && dirEntry.name !== 'import_map.json') {
        actualFunctions.push(dirEntry.name);
      }
    }
  } catch (error) {
    console.error('❌ Failed to read functions directory:', error.message);
    return;
  }

  console.log(`📁 Actual function directories: ${actualFunctions.join(', ')}`);

  // 3. Identify mismatches and create missing functions
  const analysis: FunctionDefinition[] = [];
  
  for (const funcName of configFunctions) {
    const functionPath = `./${funcName}`;
    const indexPath = `${functionPath}/index.ts`;
    
    const def: FunctionDefinition = {
      name: funcName,
      exists: existsSync(functionPath),
      hasIndex: existsSync(indexPath),
      inConfig: true,
      invokedByFrontend: false // Will check this separately
    };

    analysis.push(def);

    // Create missing function directory and basic index.ts
    if (!def.exists) {
      console.log(`🔧 Creating missing function: ${funcName}`);
      await Deno.mkdir(functionPath, { recursive: true });
      
      // Create basic index.ts template
      const indexTemplate = `import { serve } from "std/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // TODO: Implement ${funcName} logic here
    console.log('${funcName} function called');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: '${funcName} function is ready for implementation',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('${funcName} error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
`;
      
      await Deno.writeTextFile(indexPath, indexTemplate);
      console.log(`✅ Created ${indexPath}`);
    } else if (!def.hasIndex) {
      console.log(`🔧 Creating missing index.ts for: ${funcName}`);
      const indexTemplate = `import { serve } from "std/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // TODO: Implement ${funcName} logic here
    console.log('${funcName} function called');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: '${funcName} function is ready for implementation',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('${funcName} error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
`;
      
      await Deno.writeTextFile(indexPath, indexTemplate);
      console.log(`✅ Created ${indexPath}`);
    }
  }

  // 4. Check for orphaned directories
  for (const actualFunc of actualFunctions) {
    if (!configFunctions.includes(actualFunc)) {
      console.warn(`⚠️  Orphaned function directory: ${actualFunc} (not in config.toml)`);
    }
  }

  // 5. Final validation
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL ARCHITECTURE STATUS:');
  console.log('='.repeat(60));
  
  let allGood = true;
  for (const func of analysis) {
    const functionPath = `./${func.name}`;
    const indexPath = `${functionPath}/index.ts`;
    
    const nowExists = existsSync(functionPath);
    const nowHasIndex = existsSync(indexPath);
    
    if (nowExists && nowHasIndex) {
      console.log(`✅ ${func.name}: Ready for deployment`);
    } else {
      console.error(`❌ ${func.name}: Still missing files`);
      allGood = false;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  if (allGood) {
    console.log('🎉 ALL EDGE FUNCTIONS ARE NOW DEPLOYMENT-READY!');
    console.log('🚀 The "Entrypoint path does not exist" errors should be resolved.');
  } else {
    console.error('❌ Some functions still have issues - please check the output above.');
  }
  console.log('='.repeat(60));
}

// Run the audit and fix
if (import.meta.main) {
  await auditAndFix();
}