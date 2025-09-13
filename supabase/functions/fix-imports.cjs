const fs = require('fs');

const importReplacements = [
  {
    pattern: /import { serve } from "std\/http\/server\.ts";/g,
    replacement: 'import { serve } from "https://deno.land/std@0.224.0/http/server.ts";'
  },
  {
    pattern: /import { createClient } from "@supabase\/supabase-js";/g,
    replacement: 'import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";'
  },
  {
    pattern: /import { SupabaseVectorStore } from "@langchain\/community\/vectorstores\/supabase";/g,
    replacement: 'import { SupabaseVectorStore } from "https://esm.sh/@langchain/community@0.3.49/vectorstores/supabase";'
  },
  {
    pattern: /import { OpenAIEmbeddings, ChatOpenAI } from "@langchain\/openai";/g,
    replacement: 'import { OpenAIEmbeddings, ChatOpenAI } from "https://esm.sh/@langchain/openai@0.6.3";'
  },
  {
    pattern: /import { createStuffDocumentsChain } from "langchain\/chains\/combine_documents";/g,
    replacement: 'import { createStuffDocumentsChain } from "https://esm.sh/langchain@0.3.30/chains/combine_documents";'
  },
  {
    pattern: /import { createRetrievalChain } from "langchain\/chains\/retrieval";/g,
    replacement: 'import { createRetrievalChain } from "https://esm.sh/langchain@0.3.30/chains/retrieval";'
  },
  {
    pattern: /import { ChatPromptTemplate } from "@langchain\/core\/prompts";/g,
    replacement: 'import { ChatPromptTemplate } from "https://esm.sh/@langchain/core@0.3.30/prompts";'
  }
];

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

let fixed = 0;

for (const func of functions) {
  const indexPath = `./${func}/index.ts`;
  
  if (!fs.existsSync(indexPath)) {
    console.log(`⚠️  Skipping ${func} - index.ts not found`);
    continue;
  }
  
  try {
    let content = fs.readFileSync(indexPath, 'utf8');
    let hasChanges = false;
    
    for (const { pattern, replacement } of importReplacements) {
      const newContent = content.replace(pattern, replacement);
      if (newContent !== content) {
        content = newContent;
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      fs.writeFileSync(indexPath, content);
      console.log(`✅ Fixed imports in ${func}/index.ts`);
      fixed++;
    } else {
      console.log(`ℹ️  No changes needed for ${func}/index.ts`);
    }
  } catch (error) {
    console.log(`❌ Failed to fix ${func}/index.ts: ${error.message}`);
  }
}

console.log(`\n🎯 Fixed imports in ${fixed}/${functions.length} functions`);
