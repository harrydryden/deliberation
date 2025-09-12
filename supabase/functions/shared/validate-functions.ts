#!/usr/bin/env -S deno run --allow-read --allow-write

// Edge Function validation script
// Validates that all functions use the import map correctly and that config.toml is in sync

import { existsSync } from "std/fs/mod.ts";

interface FunctionConfig {
  name: string;
  verify_jwt: boolean;
  import_map: string;
}

interface ConfigToml {
  project_id: string;
  functions: Record<string, FunctionConfig>;
}

async function validateEdgeFunctions() {
  console.log('🔍 Validating Edge Functions...\n');

  let hasErrors = false;

  try {
    // 1. Read config.toml
    const configText = await Deno.readTextFile('supabase/config.toml');
    const functionBlocks = configText.match(/\[functions\.[^\]]+\]/g) || [];
    
    console.log(`📋 Found ${functionBlocks.length} function configurations in config.toml`);

    // 2. Extract function names and validate existence
    for (const block of functionBlocks) {
      const functionName = block.match(/\[functions\.([^\]]+)\]/)?.[1];
      if (!functionName) continue;

      const functionPath = `supabase/functions/${functionName}`;
      const indexPath = `${functionPath}/index.ts`;
      
      // Check if function directory and index.ts exist
      if (!existsSync(functionPath)) {
        console.error(`❌ Function directory missing: ${functionPath}`);
        hasErrors = true;
        continue;
      }
      
      if (!existsSync(indexPath)) {
        console.error(`❌ index.ts missing: ${indexPath}`);
        hasErrors = true;
        continue;
      }
      
      console.log(`✅ ${functionName}: Directory and index.ts exist`);

      // 3. Validate imports in index.ts
      try {
        const indexContent = await Deno.readTextFile(indexPath);
        await validateImports(functionName, indexContent);
      } catch (error) {
        console.error(`❌ ${functionName}: Failed to read index.ts - ${error.message}`);
        hasErrors = true;
      }
    }

    // 4. Validate import map consistency
    await validateImportMapConsistency(configText);

    // 5. Check for orphaned function directories
    for await (const dirEntry of Deno.readDir('supabase/functions')) {
      if (dirEntry.isDirectory && dirEntry.name !== 'shared') {
        const isInConfig = functionBlocks.some(block => 
          block.includes(dirEntry.name)
        );
        if (!isInConfig) {
          console.warn(`⚠️  Orphaned function directory (not in config.toml): ${dirEntry.name}`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Failed to read config.toml: ${error.message}`);
    hasErrors = true;
  }

  console.log('\n' + '='.repeat(50));
  if (hasErrors) {
    console.error('❌ Validation completed with errors');
    Deno.exit(1);
  } else {
    console.log('✅ All edge functions are valid!');
  }
}

async function validateImports(functionName: string, content: string): Promise<void> {
  const problematicImports = [
    'https://deno.land/x/xhr@',
    'https://deno.land/std@',
    'https://esm.sh/@supabase/supabase-js@',
    'https://esm.sh/@langchain/',
    'https://esm.sh/langchain@',
    'https://esm.sh/openai@',
    'https://deno.land/x/openai@'
  ];

  const expectedImports = [
    'import "xhr"',
    'import { serve } from "std/http/server.ts"',
    'import { createClient } from \'@supabase/supabase-js\'',
    '@langchain/openai',
    '@langchain/community',
    '@langchain/core',
    'langchain/',
    'import OpenAI from \'openai\''
  ];

  let hasImportIssues = false;

  // Check for problematic direct URL imports
  for (const badImport of problematicImports) {
    if (content.includes(badImport)) {
      console.error(`❌ ${functionName}: Uses direct URL import: ${badImport}...`);
      hasImportIssues = true;
    }
  }

  // Special check for xhr import
  if (content.includes('import "https://deno.land/x/xhr@')) {
    console.error(`❌ ${functionName}: Should use 'import "xhr"' instead of direct URL`);
    hasImportIssues = true;
  }

  // Check for std imports
  if (content.includes('https://deno.land/std@') && !content.includes('"std/')) {
    console.error(`❌ ${functionName}: Should use 'std/' import map instead of direct std URLs`);
    hasImportIssues = true;
  }

  if (!hasImportIssues) {
    console.log(`✅ ${functionName}: Import map usage is correct`);
  }
}

async function validateImportMapConsistency(configContent: string): Promise<void> {
  console.log('\n📦 Validating import map consistency...');
  
  // Check that all functions use the same import_map path
  const importMapLines = configContent.match(/import_map = "[^"]+"/g) || [];
  const uniqueImportMaps = [...new Set(importMapLines)];
  
  if (uniqueImportMaps.length > 1) {
    console.error('❌ Inconsistent import_map paths found:');
    uniqueImportMaps.forEach(path => console.error(`   ${path}`));
    return;
  }
  
  if (uniqueImportMaps.length === 1) {
    const expectedPath = 'import_map = "functions/import_map.json"';
    if (uniqueImportMaps[0] === expectedPath) {
      console.log('✅ All functions use consistent import map path');
    } else {
      console.error(`❌ Import map path should be: ${expectedPath}`);
      console.error(`   Found: ${uniqueImportMaps[0]}`);
    }
  }

  // Validate import_map.json exists and has required entries
  try {
    const importMapText = await Deno.readTextFile('supabase/functions/import_map.json');
    const importMap = JSON.parse(importMapText);
    
    const requiredImports = [
      'std/',
      '@supabase/supabase-js',
      'openai',
      '@langchain/openai',
      '@langchain/community',
      '@langchain/core',
      'langchain/',
      'xhr'
    ];
    
    const missingImports = requiredImports.filter(
      imp => !importMap.imports || !importMap.imports[imp]
    );
    
    if (missingImports.length > 0) {
      console.error('❌ Missing imports in import_map.json:');
      missingImports.forEach(imp => console.error(`   ${imp}`));
    } else {
      console.log('✅ import_map.json has all required entries');
    }
    
  } catch (error) {
    console.error(`❌ Failed to validate import_map.json: ${error.message}`);
  }
}

// Run validation
if (import.meta.main) {
  await validateEdgeFunctions();
}