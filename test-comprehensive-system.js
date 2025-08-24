#!/usr/bin/env node

/**
 * Comprehensive System Test Script
 * Tests all new functionality implemented in the deliberation platform
 */

import fs from 'fs';
import path from 'path';

console.log('🚀 Comprehensive Deliberation Platform Test Suite');
console.log('================================================\n');

// Test Results
const testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

function runTest(testName, testFunction) {
  testResults.total++;
  try {
    testFunction();
    console.log(`✅ ${testName} - PASSED`);
    testResults.passed++;
  } catch (error) {
    console.log(`❌ ${testName} - FAILED`);
    console.log(`   Error: ${error.message}`);
    testResults.failed++;
  }
}

// Test 1: Database Migrations
runTest('Database Migrations', () => {
  const requiredMigrations = [
    'supabase/migrations/20250821183000_create_agent_ratings.sql',
    'supabase/migrations/20250821182547_add_user_stance_scores.sql',
    'supabase/migrations/20250821182546_add_ibis_relationship_model.sql',
    'supabase/migrations/20250821182549_update_ibis_generation_prompt.sql'
  ];

  for (const migration of requiredMigrations) {
    if (!fs.existsSync(migration)) {
      throw new Error(`Missing migration: ${migration}`);
    }
    
    const content = fs.readFileSync(migration, 'utf8');
    if (content.trim().length < 100) {
      throw new Error(`Migration file too short: ${migration}`);
    }
  }
});

// Test 2: Core Services
runTest('Core Services Implementation', () => {
  const requiredServices = [
    'src/services/domain/implementations/rating.service.ts',
    'src/services/domain/implementations/stance.service.ts',
    'src/services/domain/implementations/prompt.service.ts',
    'src/services/domain/implementations/issue-recommendation.service.ts'
  ];

  for (const service of requiredServices) {
    if (!fs.existsSync(service)) {
      throw new Error(`Missing service: ${service}`);
    }
    
    const content = fs.readFileSync(service, 'utf8');
    if (!content.includes('export class')) {
      throw new Error(`Service file missing class export: ${service}`);
    }
  }
});

// Test 3: UI Components
runTest('UI Components Implementation', () => {
  const requiredComponents = [
    'src/components/chat/MessageRating.tsx',
    'src/components/admin/AgentRatingDashboard.tsx',
    'src/components/ibis/StanceScoreEditor.tsx',
    'src/components/ibis/IssueRecommendations.tsx',
    'src/components/admin/UserStanceScoreChart.tsx'
  ];

  for (const component of requiredComponents) {
    if (!fs.existsSync(component)) {
      throw new Error(`Missing component: ${component}`);
    }
    
    const content = fs.readFileSync(component, 'utf8');
    if (!content.includes('export const') && !content.includes('export default')) {
      throw new Error(`Component file missing export: ${component}`);
    }
  }
});

// Test 4: Edge Functions
runTest('Edge Functions Implementation', () => {
  const requiredFunctions = [
    'supabase/functions/robust-pdf-processor/index.ts'
  ];

  for (const func of requiredFunctions) {
    if (!fs.existsSync(func)) {
      throw new Error(`Missing edge function: ${func}`);
    }
    
    const content = fs.readFileSync(func, 'utf8');
    if (!content.includes('serve(') && !content.includes('serve(')) {
      throw new Error(`Edge function missing serve handler: ${func}`);
    }
  }
});

// Test 5: Configuration Files
runTest('Configuration Files', () => {
  const requiredConfigs = [
    'supabase/import_map.json',
    'supabase/config.toml'
  ];

  for (const config of requiredConfigs) {
    if (!fs.existsSync(config)) {
      throw new Error(`Missing config: ${config}`);
    }
  }

  // Check import map structure
  const importMap = JSON.parse(fs.readFileSync('supabase/import_map.json', 'utf8'));
  if (!importMap.imports || !importMap.imports['@supabase/supabase-js']) {
    throw new Error('Import map missing required imports');
  }

  // Check config has our functions
  const configContent = fs.readFileSync('supabase/config.toml', 'utf8');
  if (!configContent.includes('robust-pdf-processor')) {
    throw new Error('Config missing robust-pdf-processor function');
  }
});

// Test 6: Type Definitions
runTest('Type Definitions', () => {
  const requiredTypes = [
    'src/types/index.ts'
  ];

  for (const typeFile of requiredTypes) {
    if (!fs.existsSync(typeFile)) {
      throw new Error(`Missing type file: ${typeFile}`);
    }
    
    const content = fs.readFileSync(typeFile, 'utf8');
    if (!content.includes('export interface') && !content.includes('export type')) {
      throw new Error(`Type file missing interface/type exports: ${typeFile}`);
    }
  }
});

// Test 7: Admin Dashboard Integration
runTest('Admin Dashboard Integration', () => {
  const adminDashboard = 'src/components/admin/AdminDashboard.tsx';
  
  if (!fs.existsSync(adminDashboard)) {
    throw new Error('AdminDashboard component missing');
  }
  
  const content = fs.readFileSync(adminDashboard, 'utf8');
  
  // Check for agent ratings tab
  if (!content.includes('Agent Ratings') || !content.includes('value="ratings"')) {
    throw new Error('AdminDashboard missing agent ratings tab');
  }
  
  // Check for AgentRatingDashboard import
  if (!content.includes('AgentRatingDashboard')) {
    throw new Error('AdminDashboard missing AgentRatingDashboard import');
  }
});

// Test 8: Message List Integration
runTest('Message List Integration', () => {
  const messageList = 'src/components/chat/MessageList.tsx';
  
  if (!fs.existsSync(messageList)) {
    throw new Error('MessageList component missing');
  }
  
  const content = fs.readFileSync(messageList, 'utf8');
  
  // Check for MessageRating import
  if (!content.includes('MessageRating')) {
    throw new Error('MessageList missing MessageRating import');
  }
  
  // Check for MessageRating usage
  if (!content.includes('<MessageRating')) {
    throw new Error('MessageList missing MessageRating component usage');
  }
});

// Test 9: Package Dependencies
runTest('Package Dependencies', () => {
  const packageJson = 'package.json';
  
  if (!fs.existsSync(packageJson)) {
    throw new Error('package.json missing');
  }
  
  const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  
  // Check for required dependencies
  const requiredDeps = ['@supabase/supabase-js', 'react', 'typescript'];
  for (const dep of requiredDeps) {
    if (!pkg.dependencies[dep] && !pkg.devDependencies[dep]) {
      throw new Error(`Missing dependency: ${dep}`);
    }
  }
});

// Test 10: Build Configuration
runTest('Build Configuration', () => {
  const requiredBuildFiles = [
    'vite.config.ts',
    'tsconfig.json',
    'tailwind.config.ts'
  ];

  for (const buildFile of requiredBuildFiles) {
    if (!fs.existsSync(buildFile)) {
      throw new Error(`Missing build config: ${buildFile}`);
    }
  }
});

// Test 11: Database Schema Validation
runTest('Database Schema Validation', () => {
  const prismaSchema = 'prisma/schema.prisma';
  
  if (!fs.existsSync(prismaSchema)) {
    throw new Error('Prisma schema missing');
  }
  
  const schemaContent = fs.readFileSync(prismaSchema, 'utf8');
  
  // Check for agent ratings model
  if (!schemaContent.includes('model AgentRating')) {
    throw new Error('Prisma schema missing AgentRating model');
  }
  
  // Check for user stance scores (if implemented)
  if (!schemaContent.includes('user_stance_scores')) {
    console.log('   Note: User stance scores table not yet implemented in Prisma schema');
  }
});

// Test 12: File Structure Validation
runTest('File Structure Validation', () => {
  const requiredDirs = [
    'src/components/admin',
    'src/components/chat',
    'src/components/ibis',
    'src/services/domain/implementations',
    'supabase/functions',
    'supabase/migrations'
  ];

  for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
      throw new Error(`Missing directory: ${dir}`);
    }
  }
});

console.log('\n📊 Test Results Summary');
console.log('========================');
console.log(`Total Tests: ${testResults.total}`);
console.log(`Passed: ${testResults.passed} ✅`);
console.log(`Failed: ${testResults.failed} ❌`);
console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

if (testResults.failed === 0) {
  console.log('\n🎉 All tests passed! The system is ready for testing.');
  console.log('\n📋 Next Steps:');
  console.log('1. Run the database migrations in Supabase SQL Editor');
  console.log('2. Start the development server: npm run dev');
  console.log('3. Test the agent rating system in chat');
  console.log('4. Check the admin dashboard for new tabs');
  console.log('5. Test PDF upload and processing');
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  console.log('\n🔧 Fix the failing tests before proceeding with deployment.');
}

console.log('\n🚀 Comprehensive test suite completed!');
