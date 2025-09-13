const fs = require('fs');
const path = require('path');

/**
 * Comprehensive Edge Function Deployment Validator
 * Checks for common issues that cause deployment failures
 */

function validateDeployment() {
  console.log('🔍 Validating Edge Function Deployment Readiness...\n');
  
  const issues = [];
  const warnings = [];
  
  // Check for shared module imports
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
  
  console.log('📋 Checking function files...');
  
  for (const func of functions) {
    const indexPath = `./${func}/index.ts`;
    const importMapPath = `./${func}/import_map.json`;
    
    // Check if function exists
    if (!fs.existsSync(indexPath)) {
      issues.push(`❌ ${func}: Missing index.ts file`);
      continue;
    }
    
    // Check if import map exists
    if (!fs.existsSync(importMapPath)) {
      issues.push(`❌ ${func}: Missing import_map.json file`);
      continue;
    }
    
    try {
      const content = fs.readFileSync(indexPath, 'utf8');
      
      // Check for shared module imports
      if (content.includes('../shared/')) {
        issues.push(`❌ ${func}: Contains shared module imports`);
      }
      
      // Check for bare imports
      const bareImportPatterns = [
        /import.*from\s+"@supabase\/supabase-js"/,
        /import.*from\s+"std\//,
        /import.*from\s+"@langchain\//,
        /import.*from\s+"langchain\//
      ];
      
      for (const pattern of bareImportPatterns) {
        if (pattern.test(content)) {
          issues.push(`❌ ${func}: Contains bare imports (should use full URLs)`);
          break;
        }
      }
      
      // Check for proper serve function
      if (!content.includes('serve(')) {
        issues.push(`❌ ${func}: Missing serve() function call`);
      }
      
      // Check for CORS headers
      if (!content.includes('corsHeaders') && !content.includes('CORS')) {
        warnings.push(`⚠️  ${func}: No CORS headers found`);
      }
      
      // Check for error handling
      if (!content.includes('try') && !content.includes('catch')) {
        warnings.push(`⚠️  ${func}: No error handling found`);
      }
      
    } catch (error) {
      issues.push(`❌ ${func}: Error reading file - ${error.message}`);
    }
  }
  
  // Check config.toml
  console.log('\n📋 Checking config.toml...');
  
  try {
    const configContent = fs.readFileSync('../config.toml', 'utf8');
    const configFunctions = configContent.match(/\[functions\.([^\]]+)\]/g) || [];
    const configFunctionNames = configFunctions.map(match => 
      match.match(/\[functions\.([^\]]+)\]/)[1]
    );
    
    // Check if all functions are in config
    for (const func of functions) {
      if (!configFunctionNames.includes(func)) {
        issues.push(`❌ ${func}: Not found in config.toml`);
      }
    }
    
    // Check for extra functions in config
    for (const configFunc of configFunctionNames) {
      if (!functions.includes(configFunc)) {
        warnings.push(`⚠️  ${configFunc}: Found in config.toml but no directory exists`);
      }
    }
    
  } catch (error) {
    issues.push(`❌ Error reading config.toml: ${error.message}`);
  }
  
  // Check global import map
  console.log('\n📋 Checking global import map...');
  
  try {
    const globalImportMap = JSON.parse(fs.readFileSync('./import_map.json', 'utf8'));
    
    // Check for required imports
    const requiredImports = [
      'std/',
      '@supabase/supabase-js',
      'langchain/',
      '@langchain/openai',
      '@langchain/community',
      '@langchain/core'
    ];
    
    for (const required of requiredImports) {
      if (!globalImportMap.imports[required]) {
        issues.push(`❌ Global import map missing: ${required}`);
      }
    }
    
  } catch (error) {
    issues.push(`❌ Error reading global import map: ${error.message}`);
  }
  
  // Report results
  console.log('\n📊 VALIDATION RESULTS:');
  console.log('='.repeat(50));
  
  if (issues.length === 0) {
    console.log('✅ All functions are deployment-ready!');
  } else {
    console.log('❌ Issues found:');
    issues.forEach(issue => console.log(`  ${issue}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`  ${warning}`));
  }
  
  console.log(`\n📈 Summary:`);
  console.log(`  Functions checked: ${functions.length}`);
  console.log(`  Issues found: ${issues.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  
  if (issues.length === 0) {
    console.log('\n🚀 Ready for deployment!');
    process.exit(0);
  } else {
    console.log('\n🛠️  Please fix the issues above before deploying.');
    process.exit(1);
  }
}

validateDeployment();
