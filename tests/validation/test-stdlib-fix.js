/**
 * Test: Standard Library False Positive Fix
 * Verifies that standard library functions are NOT flagged as hallucinations
 */

import { buildSymbolTable } from '../../dist/analyzers/symbolTable.js';
import { validateReferences } from '../../dist/analyzers/referenceValidator.js';
import { isStandardLibrary } from '../../dist/analyzers/standardLibrary.js';

console.log('🧪 Testing Standard Library False Positive Fixes\n');
console.log('='.repeat(70));

async function testStandardLibraryFix() {
  let passed = 0;
  let failed = 0;

  // Test 1: Python built-ins
  console.log('\n📋 Test 1: Python Built-in Functions\n');
  
  const pythonBuiltins = ['hasattr', 'getattr', 'setattr', 'len', 'str', 'int', 'print'];
  for (const func of pythonBuiltins) {
    const isStdLib = isStandardLibrary(func, 'python');
    if (isStdLib) {
      console.log(`   ✅ ${func} correctly identified as built-in`);
      passed++;
    } else {
      console.log(`   ❌ ${func} incorrectly flagged as non-standard`);
      failed++;
    }
  }

  // Test 2: Python standard library
  console.log('\n📋 Test 2: Python Standard Library\n');
  
  const pythonStdLib = ['getenv', 'load_dotenv'];
  for (const func of pythonStdLib) {
    const isStdLib = isStandardLibrary(func, 'python');
    if (isStdLib) {
      console.log(`   ✅ ${func} correctly identified as standard library`);
      passed++;
    } else {
      console.log(`   ❌ ${func} incorrectly flagged as non-standard`);
      failed++;
    }
  }

  // Test 3: FastAPI classes
  console.log('\n📋 Test 3: FastAPI Classes\n');
  
  const fastAPIClasses = ['APIRouter', 'FastAPI', 'HTTPException', 'Depends'];
  for (const cls of fastAPIClasses) {
    const isStdLib = isStandardLibrary(cls, 'python');
    if (isStdLib) {
      console.log(`   ✅ ${cls} correctly identified as FastAPI class`);
      passed++;
    } else {
      console.log(`   ❌ ${cls} incorrectly flagged as non-standard`);
      failed++;
    }
  }

  // Test 4: JavaScript keywords
  console.log('\n📋 Test 4: JavaScript Keywords\n');
  
  const jsKeywords = ['async', 'await', 'const', 'let'];
  for (const keyword of jsKeywords) {
    const isStdLib = isStandardLibrary(keyword, 'javascript');
    if (isStdLib) {
      console.log(`   ✅ ${keyword} correctly identified as keyword`);
      passed++;
    } else {
      console.log(`   ❌ ${keyword} incorrectly flagged as non-standard`);
      failed++;
    }
  }

  // Test 5: Real code with imports
  console.log('\n📋 Test 5: Real Code with Imports\n');
  
  const pythonCode = `
from fastapi import APIRouter, Depends, HTTPException
from dotenv import load_dotenv
import os

router = APIRouter()

def get_config():
    load_dotenv()
    api_key = os.getenv("API_KEY")
    return api_key

@router.get("/test")
def test_endpoint():
    config = get_config()
    if hasattr(config, "key"):
        return {"status": "ok"}
`;

  const symbols = await buildSymbolTable(pythonCode, 'python');
  console.log(`   📊 Extracted symbols:`);
  console.log(`      Functions: ${symbols.functions.length} (${symbols.functions.join(', ')})`);
  console.log(`      Imports: ${symbols.imports.length} (${symbols.imports.join(', ')})`);
  
  const issues = await validateReferences(pythonCode, symbols, 'python');
  
  console.log(`\n   📊 Validation results:`);
  console.log(`      Issues found: ${issues.length}`);
  
  if (issues.length === 0) {
    console.log(`   ✅ No false positives! All standard library functions recognized`);
    passed++;
  } else {
    console.log(`   ❌ False positives detected:`);
    issues.forEach(issue => {
      console.log(`      - ${issue.message}`);
    });
    failed++;
  }

  // Test 6: Real code with hallucinations
  console.log('\n📋 Test 6: Real Code with Actual Hallucinations\n');
  
  const codeWithHallucinations = `
from fastapi import APIRouter

router = APIRouter()

@router.get("/users")
def get_users():
    users = fetch_all_users()  # HALLUCINATION
    return users

def process_data():
    result = non_existent_function()  # HALLUCINATION
    return result
`;

  const symbols2 = await buildSymbolTable(codeWithHallucinations, 'python');
  const issues2 = await validateReferences(codeWithHallucinations, symbols2, 'python');
  
  console.log(`   📊 Validation results:`);
  console.log(`      Issues found: ${issues2.length}`);
  
  if (issues2.length >= 2) {
    console.log(`   ✅ Correctly detected hallucinations:`);
    issues2.forEach(issue => {
      const funcName = issue.message.match(/'([^']+)'/)?.[1];
      console.log(`      - ${funcName}()`);
    });
    passed++;
  } else {
    console.log(`   ❌ Failed to detect hallucinations`);
    failed++;
  }

  // Final results
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 TEST RESULTS\n');
  console.log(`   Total Tests: ${passed + failed}`);
  console.log(`   Passed: ${passed} ✅`);
  console.log(`   Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
  console.log(`   Success Rate: ${Math.round(passed / (passed + failed) * 100)}%`);

  console.log('\n' + '='.repeat(70));
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! False positives fixed!\n');
  } else {
    console.log('\n⚠️  Some tests failed. Review needed.\n');
  }

  return { passed, failed, success: failed === 0 };
}

testStandardLibraryFix()
  .then(result => {
    console.log(`✅ Standard library test completed!`);
    console.log(`   Passed: ${result.passed}`);
    console.log(`   Failed: ${result.failed}\n`);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
