#!/usr/bin/env -S deno run --allow-read
/**
 * Pre-deployment validation to prevent "Entrypoint path does not exist" errors
 * Run this before any deployment to catch architecture issues early
 */

import { existsSync } from "https://deno.land/std@0.208.0/fs/exists.ts";

async function preflightCheck(): Promise<boolean> {
  console.log('🚀 EDGE FUNCTION DEPLOYMENT PREFLIGHT CHECK\n');

  let allChecksPass = true;

  try {
    // 1. Validate config.toml exists and is readable
    if (!existsSync('../config.toml')) {
      console.error('❌ supabase/config.toml not found');
      return false;
    }

    const configText = await Deno.readTextFile('../config.toml');
    const functionMatches = configText.match(/\[functions\.([^\]]+)\]/g) || [];
    const configFunctions = functionMatches
      .map(match => match.match(/\[functions\.([^\]]+)\]/)?.[1])
      .filter(Boolean) as string[];

    if (configFunctions.length === 0) {
      console.warn('⚠️  No functions found in config.toml');
      return true;
    }

    console.log(`📋 Checking ${configFunctions.length} function(s): ${configFunctions.join(', ')}\n`);

    // 2. Check each function's deployment readiness
    for (const funcName of configFunctions) {
      const functionDir = `./${funcName}`;
      const indexFile = `${functionDir}/index.ts`;
      
      console.log(`🔍 Checking ${funcName}...`);
      
      // Check directory exists
      if (!existsSync(functionDir)) {
        console.error(`   ❌ Directory missing: ${functionDir}`);
        allChecksPass = false;
        continue;
      }
      
      // Check index.ts exists
      if (!existsSync(indexFile)) {
        console.error(`   ❌ Entry point missing: ${indexFile}`);
        allChecksPass = false;
        continue;
      }
      
      // Check index.ts is not empty
      try {
        const indexContent = await Deno.readTextFile(indexFile);
        if (indexContent.trim().length === 0) {
          console.error(`   ❌ Entry point is empty: ${indexFile}`);
          allChecksPass = false;
          continue;
        }
        
        // Check for basic serve function
        if (!indexContent.includes('serve(')) {
          console.warn(`   ⚠️  No serve() function found in ${indexFile}`);
        }
        
        console.log(`   ✅ ${funcName} is deployment-ready`);
        
      } catch (error) {
        console.error(`   ❌ Cannot read ${indexFile}: ${error.message}`);
        allChecksPass = false;
      }
    }

    // 3. Check for orphaned directories
    console.log('\n🗂️  Checking for orphaned directories...');
    
    for await (const dirEntry of Deno.readDir('./')) {
      if (dirEntry.isDirectory && dirEntry.name !== 'shared') {
        if (!configFunctions.includes(dirEntry.name)) {
          console.warn(`   ⚠️  Orphaned directory: ${dirEntry.name} (not in config.toml)`);
        }
      }
    }

    // 4. Validate import_map.json
    console.log('\n📦 Checking import_map.json...');
    
    if (!existsSync('./import_map.json')) {
      console.error('   ❌ import_map.json not found');
      allChecksPass = false;
    } else {
      try {
        const importMapText = await Deno.readTextFile('./import_map.json');
        const importMap = JSON.parse(importMapText);
        
        if (!importMap.imports) {
          console.error('   ❌ import_map.json missing "imports" section');
          allChecksPass = false;
        } else {
          const requiredImports = ['std/', '@supabase/supabase-js', 'openai'];
          const missingImports = requiredImports.filter(
            imp => !importMap.imports[imp]
          );
          
          if (missingImports.length > 0) {
            console.error(`   ❌ Missing required imports: ${missingImports.join(', ')}`);
            allChecksPass = false;
          } else {
            console.log('   ✅ import_map.json looks good');
          }
        }
      } catch (error) {
        console.error(`   ❌ Invalid import_map.json: ${error.message}`);
        allChecksPass = false;
      }
    }

  } catch (error) {
    console.error(`❌ Preflight check failed: ${error.message}`);
    return false;
  }

  console.log('\n' + '='.repeat(60));
  if (allChecksPass) {
    console.log('🎉 ALL PREFLIGHT CHECKS PASSED!');
    console.log('✈️  Functions are ready for deployment');
  } else {
    console.log('❌ PREFLIGHT CHECKS FAILED');
    console.log('🔧 Please fix the issues above before deploying');
  }
  console.log('='.repeat(60));

  return allChecksPass;
}

// Run the preflight check
if (import.meta.main) {
  const success = await preflightCheck();
  Deno.exit(success ? 0 : 1);
}