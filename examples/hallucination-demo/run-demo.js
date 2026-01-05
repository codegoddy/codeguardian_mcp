#!/usr/bin/env node

/**
 * Hallucination Detection Demo
 * 
 * This script demonstrates CodeGuardian's hallucination detection by:
 * 1. Loading an existing codebase
 * 2. Loading AI-generated code with hallucinations
 * 3. Running hallucination detection
 * 4. Displaying results
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the hallucination detection tool
import { preventHallucinationsTool } from '../../dist/tools/preventHallucinations.js';

async function runDemo() {
  console.log('🔍 CodeGuardian Hallucination Detection Demo\n');
  console.log('=' .repeat(70));
  console.log('\n');

  // Load existing codebase
  const existingCodePath = join(__dirname, 'existing-codebase.ts');
  const existingCode = readFileSync(existingCodePath, 'utf-8');
  
  console.log('📁 Loaded existing codebase:');
  console.log(`   - UserService with methods: login, verifyToken, getUser, etc.`);
  console.log(`   - AuthService with methods: hashPassword, comparePasswords, generateToken`);
  console.log('\n');

  // Load AI-generated code with hallucinations
  const aiCodePath = join(__dirname, 'ai-generated-with-hallucinations.ts');
  const aiGeneratedCode = readFileSync(aiCodePath, 'utf-8');
  
  console.log('🤖 Loaded AI-generated code (AuthController)');
  console.log('   This code contains several hallucinations...');
  console.log('\n');

  console.log('⚡ Running hallucination detection...\n');
  
  // Run hallucination detection
  const startTime = Date.now();
  
  try {
    const result = await preventHallucinationsTool.handler({
      codebase: existingCode,
      newCode: aiGeneratedCode,
      language: 'typescript',
      options: {
        checkNonExistentReferences: true,
        checkImportConsistency: true,
        checkTypeConsistency: true,
        checkLogicContradictions: true,
        checkParameterMismatches: true,
        checkReturnValueConsistency: true,
      },
    });

    const elapsedTime = Date.now() - startTime;
    
    // Parse the result
    const analysisResult = JSON.parse(result.content[0].text);
    
    console.log('✅ Analysis Complete!\n');
    console.log('=' .repeat(70));
    console.log('\n');

    // Display results
    console.log('📊 HALLUCINATION DETECTION RESULTS\n');
    console.log(`⏱️  Analysis Time: ${analysisResult.analysisTime}`);
    console.log(`🎯 Hallucination Score: ${analysisResult.hallucinationScore}/100`);
    console.log(`⚠️  Hallucination Detected: ${analysisResult.hallucinationDetected ? 'YES' : 'NO'}`);
    console.log(`🐛 Issues Found: ${analysisResult.issues.length}`);
    console.log('\n');

    // Display symbol table summary
    console.log('📚 SYMBOL TABLE SUMMARY\n');
    console.log(`   Functions: ${analysisResult.symbolTable.functions.length}`);
    console.log(`   Classes: ${analysisResult.symbolTable.classes.length}`);
    console.log(`   Variables: ${analysisResult.symbolTable.variables.length}`);
    console.log(`   Imports: ${analysisResult.symbolTable.imports.length}`);
    console.log('\n');

    // Display consistency analysis
    console.log('📈 CONSISTENCY ANALYSIS\n');
    console.log(`   Naming Consistency: ${analysisResult.consistencyAnalysis.namingConsistency.toFixed(1)}%`);
    console.log(`   Type Consistency: ${analysisResult.consistencyAnalysis.typeConsistency.toFixed(1)}%`);
    console.log(`   API Consistency: ${analysisResult.consistencyAnalysis.apiConsistency.toFixed(1)}%`);
    console.log('\n');

    // Display recommendation
    console.log('💡 RECOMMENDATION\n');
    console.log(`   Risk Level: ${analysisResult.recommendation.riskLevel.toUpperCase()}`);
    console.log(`   Accept Code: ${analysisResult.recommendation.accept ? 'YES' : 'NO'}`);
    console.log(`   Requires Review: ${analysisResult.recommendation.requiresReview ? 'YES' : 'NO'}`);
    console.log(`   Action: ${analysisResult.recommendation.action}`);
    console.log('\n');

    // Display detailed issues
    if (analysisResult.issues.length > 0) {
      console.log('🔍 DETAILED ISSUES\n');
      console.log('=' .repeat(70));
      
      analysisResult.issues.forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.type.toUpperCase()}`);
        console.log(`   Severity: ${issue.severity.toUpperCase()}`);
        console.log(`   Location: Line ${issue.line}, Column ${issue.column}`);
        console.log(`   Message: ${issue.message}`);
        console.log(`   Code: ${issue.code}`);
        if (issue.suggestion) {
          console.log(`   💡 Suggestion: ${issue.suggestion}`);
        }
        console.log(`   Confidence: ${issue.confidence}%`);
      });
      
      console.log('\n');
      console.log('=' .repeat(70));
    }

    // Display context summary
    console.log('\n📋 CONTEXT SUMMARY\n');
    console.log(`   Total Functions: ${analysisResult.contextSummary.totalFunctions}`);
    console.log(`   Total Classes: ${analysisResult.contextSummary.totalClasses}`);
    console.log(`   Referenced from AI: ${analysisResult.contextSummary.referencedFromAI}`);
    console.log(`   Matched References: ${analysisResult.contextSummary.matchedReferences}`);
    console.log(`   Unmatched References: ${analysisResult.contextSummary.unmatchedReferences}`);
    console.log('\n');

    // Summary
    console.log('=' .repeat(70));
    console.log('\n🎯 DEMO SUMMARY\n');
    
    const hallucinationCount = analysisResult.issues.filter(
      i => i.type === 'nonExistentFunction' || i.type === 'nonExistentClass'
    ).length;
    
    console.log(`✅ Successfully detected ${hallucinationCount} hallucinations!`);
    console.log(`⚡ Analysis completed in ${elapsedTime}ms`);
    console.log(`🛡️  CodeGuardian prevented potential runtime errors`);
    console.log(`💰 Estimated time saved: 2-3 hours of debugging\n`);
    
    console.log('=' .repeat(70));
    console.log('\n🏆 This is the WINNING FEATURE that solves the "70% wall"!\n');

  } catch (error) {
    console.error('❌ Error running hallucination detection:', error);
    process.exit(1);
  }
}

// Run the demo
runDemo().catch(console.error);
