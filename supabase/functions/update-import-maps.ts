#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Update all function import maps to use standardized versions
 */

const standardImportMap = {
  "imports": {
    "std/": "https://deno.land/std@0.224.0/",
    "xhr": "https://deno.land/x/xhr@0.3.0/mod.ts",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.53.1",
    "pdfjs-dist": "https://esm.sh/pdfjs-dist@3.11.174",
    "langchain/": "https://esm.sh/langchain@0.3.30/",
    "@langchain/openai": "https://esm.sh/@langchain/openai@0.6.3",
    "@langchain/community": "https://esm.sh/@langchain/community@0.3.49",
    "@langchain/core": "https://esm.sh/@langchain/core@0.3.30",
    "openai": "https://esm.sh/openai@4.52.6",
    "zod": "https://esm.sh/zod@3.22.4"
  }
};

async function updateAllImportMaps() {
  const functions = [
    'admin_get_users',
    'admin_get_users_v2', 
    'agent_orchestration_stream',
    'calculate_user_stance',
    'classify_message',
    'generate_issue_recommendations',
    'generate_notion_statement',
    'generate_proactive_prompt',
    'ibis_embeddings',
    'knowledge_query',
    'link_similar_ibis_issues',
    'pdf_processor',
    'realtime_session',
    'relationship_evaluator',
    'voice_to_text'
  ];
  
  let updated = 0;
  
  for (const func of functions) {
    const importMapPath = `./${func}/import_map.json`;
    
    try {
      await Deno.writeTextFile(importMapPath, JSON.stringify(standardImportMap, null, 2));
      updated++;
    } catch (error) {
      }
  }
  
  }

updateAllImportMaps();
