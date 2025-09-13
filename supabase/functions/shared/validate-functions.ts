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
  let hasErrors = false;

  try {
    // 1. Read config.toml
    const configText = await Deno.readTextFile('supabase/config.toml');
    const functionBlocks = configText.match(/\[functions\.[^\]]+\]/g) || [];
    
    // 2. Extract function names and validate existence
    for (const block of functionBlocks) {
      const functionName = block.match(/\[functions\.([^\]]+)\]/)?.[1];
      if (!functionName) continue;

      const functionPath = `supabase/functions/${functionName}`;
      const indexPath = `${functionPath}/index.ts`;
      
      // Check if function directory and index.ts exist
      if (!existsSync(functionPath)) {
        hasErrors = true;
        continue;
      }
      
      if (!existsSync(indexPath)) {
        hasErrors = true;
        continue;
      }
      
      // 3. Validate imports in index.ts
      try {
        const indexContent = await Deno.readTextFile(indexPath);
        await validateImports(functionName, indexContent);
      } catch (error) {
        hasErrors = true;
      }
    }

    // 4. Validate import map consistency
    await validateImportMapConsistency(configText);

    // 5. Cross-check frontend invocations vs config and filesystem
    const frontendOk = await validateFrontendInvocations(configText);
    if (!frontendOk) hasErrors = true;

    // 6. Check for orphaned function directories
    for await (const dirEntry of Deno.readDir('supabase/functions')) {
      if (dirEntry.isDirectory && dirEntry.name !== 'shared') {
        const isInConfig = functionBlocks.some(block => 
          block.includes(dirEntry.name)
        );
        if (!isInConfig) {
          : ${dirEntry.name}`);
        }
      }
    }

  } catch (error) {
    hasErrors = true;
  }

  );
  if (hasErrors) {
    Deno.exit(1);
  } else {
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
      hasImportIssues = true;
    }
  }

  // Special check for xhr import
  if (content.includes('import "https://deno.land/x/xhr@')) {
    hasImportIssues = true;
  }

  // Check for std imports
  if (content.includes('https://deno.land/std@') && !content.includes('"std/')) {
    hasImportIssues = true;
  }

  if (!hasImportIssues) {
    }
}

async function validateImportMapConsistency(configContent: string): Promise<void> {
  // Check that all functions use the same import_map path
  const importMapLines = configContent.match(/import_map = "[^"]+"/g) || [];
  const uniqueImportMaps = [...new Set(importMapLines)];
  
  if (uniqueImportMaps.length > 1) {
    uniqueImportMaps.forEach(path => );
    return;
  }
  
  if (uniqueImportMaps.length === 1) {
    const expectedPath = 'import_map = "functions/import_map.json"';
    if (uniqueImportMaps[0] === expectedPath) {
      } else {
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
      missingImports.forEach(imp => );
    } else {
      }
    
  } catch (error) {
    }
}

async function validateFrontendInvocations(configContent: string): Promise<boolean> {
  let ok = true;

  const blocks = configContent.match(/\[functions\.([^\]]+)\]/g) || [];
  const configNames = new Set(
    blocks
      .map((b) => b.match(/\[functions\.([^\]]+)\]/)?.[1])
      .filter(Boolean) as string[],
  );

  const invokedNames = new Set<string>();

  async function walkDir(dir: string): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        await walkDir(path);
      } else if (
        entry.isFile &&
        (path.endsWith('.ts') ||
          path.endsWith('.tsx') ||
          path.endsWith('.js') ||
          path.endsWith('.jsx'))
      ) {
        try {
          const text = await Deno.readTextFile(path);
          const regex = /supabase\\.functions\\.invoke\(['"]([^'\"]+)['"]\)/g;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(text)) !== null) {
            invokedNames.add(match[1]);
          }
        } catch (_) {
          // ignore unreadable files
        }
      }
    }
  }

  try {
    await walkDir('src');
  } catch (_) {
    return true;
  }

  in frontend: ${[...invokedNames].join(', ')}`);

  for (const name of invokedNames) {
    if (!configNames.has(name)) {
      ok = false;
    }
    const dirPath = `supabase/functions/${name}`;
    const indexPath = `${dirPath}/index.ts`;
    if (!existsSync(dirPath) || !existsSync(indexPath)) {
      ok = false;
    }
  }

  for (const name of configNames) {
    if (!invokedNames.has(name)) {
      }
  }

  if (ok) {
    }
  return ok;
}

// Run validation
if (import.meta.main) {
  await validateEdgeFunctions();
}