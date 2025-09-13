#!/usr/bin/env -S deno run --allow-read
/**
 * Pre-deployment validation to prevent "Entrypoint path does not exist" errors
 * Run this before any deployment to catch architecture issues early
 */

import { existsSync } from "https://deno.land/std@0.208.0/fs/exists.ts";

async function preflightCheck(): Promise<boolean> {
  let allChecksPass = true;

  try {
    // 1. Validate config.toml exists and is readable
    if (!existsSync('../config.toml')) {
      return false;
    }

    const configText = await Deno.readTextFile('../config.toml');
    const functionMatches = configText.match(/\[functions\.([^\]]+)\]/g) || [];
    const configFunctions = functionMatches
      .map(match => match.match(/\[functions\.([^\]]+)\]/)?.[1])
      .filter(Boolean) as string[];

    if (configFunctions.length === 0) {
      return true;
    }

    : ${configFunctions.join(', ')}\n`);

    // 2. Check each function's deployment readiness
    for (const funcName of configFunctions) {
      const functionDir = `./${funcName}`;
      const indexFile = `${functionDir}/index.ts`;
      
      // Check directory exists
      if (!existsSync(functionDir)) {
        allChecksPass = false;
        continue;
      }
      
      // Check index.ts exists
      if (!existsSync(indexFile)) {
        allChecksPass = false;
        continue;
      }
      
      // Check index.ts is not empty
      try {
        const indexContent = await Deno.readTextFile(indexFile);
        if (indexContent.trim().length === 0) {
          allChecksPass = false;
          continue;
        }
        
        // Check for basic serve function
        if (!indexContent.includes('serve(')) {
          function found in ${indexFile}`);
        }
        
        } catch (error) {
        allChecksPass = false;
      }
    }

    // 3. Check for orphaned directories
    for await (const dirEntry of Deno.readDir('./')) {
      if (dirEntry.isDirectory && dirEntry.name !== 'shared') {
        if (!configFunctions.includes(dirEntry.name)) {
          `);
        }
      }
    }

    // 4. Validate import_map.json
    if (!existsSync('./import_map.json')) {
      allChecksPass = false;
    } else {
      try {
        const importMapText = await Deno.readTextFile('./import_map.json');
        const importMap = JSON.parse(importMapText);
        
        if (!importMap.imports) {
          allChecksPass = false;
        } else {
          const requiredImports = ['std/', '@supabase/supabase-js', 'openai'];
          const missingImports = requiredImports.filter(
            imp => !importMap.imports[imp]
          );
          
          if (missingImports.length > 0) {
            }`);
            allChecksPass = false;
          } else {
            }
        }
      } catch (error) {
        allChecksPass = false;
      }
    }

  } catch (error) {
    return false;
  }

  );
  if (allChecksPass) {
    } else {
    }
  );

  return allChecksPass;
}

// Run the preflight check
if (import.meta.main) {
  const success = await preflightCheck();
  Deno.exit(success ? 0 : 1);
}