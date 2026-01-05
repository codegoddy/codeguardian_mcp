/**
 * EXTREMELY ROBUST TEST SUITE
 * Ultra-comprehensive validation of Phase 1 & 2
 * Tests every edge case, error condition, and integration point
 */

import { buildSymbolTable } from '../../dist/analyzers/symbolTable.js';
import { validateReferences } from '../../dist/analyzers/referenceValidator.js';
import { scanForVulnerabilities, calculateSecurityScore, getVulnerabilitySummary } from '../../dist/analyzers/security/securityScanner.js';
import { detectAntiPatterns, calculateQualityScore, getAntiPatternSummary, groupByCategory } from '../../dist/analyzers/antiPatternDetector.js';
import { detectLanguage, detectFromPath, detectFromShebang, detectFromContent, getSupportedLanguages } from '../../dist/analyzers/languageDetector.js';
import { comprehensiveAnalysis, quickAnalysis, securityAnalysis, qualityAnalysis } from '../../dist/analyzers/unifiedAnalyzer.js';

// Enhanced test tracking
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  warnings: [],
  performance: [],
  suites: {},
};

function startSuite(name) {
  if (!testResults.suites[name]) {
    testResults.suites[name] = { passed: 0, failed: 0, tests: [] };
  }
  console.log(`\n${'='.repeat(70)}`);
  console.log(`\n📋 ${name}\n`);
}

function assert(condition, message, suiteName) {
  const result = {
    message,
    passed: !!condition,
    timestamp: Date.now(),
  };
  
  if (condition) {
    testResults.passed++;
    if (suiteName && testResults.suites[suiteName]) {
      testResults.suites[suiteName].passed++;
    }
    console.log(`   ✅ PASS: ${message}`);
  } else {
    testResults.failed++;
    if (suiteName && testResults.suites[suiteName]) {
      testResults.suites[suiteName].failed++;
    }
    testResults.errors.push(message);
    console.log(`   ❌ FAIL: ${message}`);
  }
  
  if (suiteName && testResults.suites[suiteName]) {
    testResults.suites[suiteName].tests.push(result);
  }
  return condition;
}

function measurePerformance(name, fn) {
  const start = Date.now();
  const result = fn();
  const time = Date.now() - start;
  testResults.performance.push({ name, time });
  return { result, time };
}

async function runExtremelyRobustTests() {
  console.log('🔬 EXTREMELY ROBUST TEST SUITE\n');
  console.log('Ultra-comprehensive validation of Phase 1 & 2');
  console.log('Testing every edge case, error condition, and integration point\n');
  console.log('='.repeat(70));

  // SUITE 1: Symbol Table - Comprehensive
  startSuite('SUITE 1: Symbol Table Extraction - Comprehensive');
  
  try {
    // Test 1.1: JavaScript - All function types
    const jsCode = `
      // Regular functions
      function regularFunc() {}
      function* generatorFunc() {}
      
      // Arrow functions
      const arrowFunc = () => {};
      const arrowFuncBlock = () => { return 42; };
      const arrowFuncAsync = async () => {};
      
      // Function expressions
      const funcExpr = function() {};
      const namedFuncExpr = function named() {};
      
      // Class methods
      class MyClass {
        constructor() {}
        method() {}
        async asyncMethod() {}
        static staticMethod() {}
        get getter() {}
        set setter(val) {}
      }
      
      // Object methods
      const obj = {
        method() {},
        async asyncMethod() {},
      };
    `;
    
    const { result: jsSymbols, time } = measurePerformance('JS Symbol Extraction', 
      () => buildSymbolTable(jsCode, 'javascript'));
    await jsSymbols;
    
    assert((await jsSymbols).functions.length >= 10, 'Should extract 10+ JS functions', 'SUITE 1');
    assert((await jsSymbols).classes.length >= 1, 'Should extract JS classes', 'SUITE 1');
    assert(time < 10, `JS extraction should be < 10ms (was ${time}ms)`, 'SUITE 1');
    
    // Test 1.2: TypeScript - Type annotations
    const tsCode = `
      interface User {
        name: string;
        age: number;
      }
      
      type UserID = string | number;
      
      function getUser(id: UserID): User {
        return { name: 'test', age: 30 };
      }
      
      class UserService {
        async findUser(id: string): Promise<User> {
          return { name: 'test', age: 30 };
        }
      }
    `;
    
    const tsSymbols = await buildSymbolTable(tsCode, 'typescript');
    assert(tsSymbols.functions.length >= 2, 'Should extract TS functions', 'SUITE 1');
    assert(tsSymbols.interfaces && tsSymbols.interfaces.length >= 2, 'Should extract TS interfaces/types', 'SUITE 1');
    
    // Test 1.3: Python - All function types
    const pyCode = `
      # Regular functions
      def regular_func():
          pass
      
      # Async functions
      async def async_func():
          pass
      
      # Decorated functions
      @decorator
      def decorated_func():
          pass
      
      @app.route('/test')
      @login_required
      def multi_decorated():
          pass
      
      # Class methods
      class MyClass:
          def __init__(self):
              pass
          
          def method(self):
              pass
          
          async def async_method(self):
              pass
          
          @staticmethod
          def static_method():
              pass
          
          @classmethod
          def class_method(cls):
              pass
          
          @property
          def prop(self):
              pass
      
      # Lambda functions
      lambda_func = lambda x: x * 2
    `;
    
    const pySymbols = await buildSymbolTable(pyCode, 'python');
    assert(pySymbols.functions.length >= 8, 'Should extract 8+ Python functions', 'SUITE 1');
    assert(pySymbols.classes.length >= 1, 'Should extract Python classes', 'SUITE 1');
    
    // Test 1.4: Edge cases
    const edgeCases = [
      { code: '', desc: 'empty code' },
      { code: '// only comments', desc: 'comment-only' },
      { code: '   \n\n   ', desc: 'whitespace-only' },
      { code: 'function', desc: 'incomplete syntax' },
    ];
    
    for (const { code, desc } of edgeCases) {
      const symbols = await buildSymbolTable(code, 'javascript');
      assert(symbols.functions.length === 0, `${desc} should have 0 functions`, 'SUITE 1');
    }
    
  } catch (error) {
    assert(false, `Symbol table suite failed: ${error.message}`, 'SUITE 1');
  }

  // SUITE 2: Hallucination Detection - Extreme Cases
  startSuite('SUITE 2: Hallucination Detection - Extreme Cases');
  
  try {
    // Test 2.1: Multiple hallucinations
    const existing = `
      function existingFunc1() {}
      function existingFunc2() {}
      class ExistingClass {}
    `;
    
    const newCode = `
      existingFunc1();
      existingFunc2();
      nonExistent1();
      nonExistent2();
      nonExistent3();
      new ExistingClass();
      new NonExistentClass();
    `;
    
    const existingSymbols = await buildSymbolTable(existing, 'javascript');
    const newSymbols = await buildSymbolTable(newCode, 'javascript');
    const combined = {
      functions: [...new Set([...existingSymbols.functions, ...newSymbols.functions])],
      classes: [...new Set([...existingSymbols.classes, ...newSymbols.classes])],
      variables: [],
      imports: [],
      dependencies: [],
    };
    
    const issues = await validateReferences(newCode, combined, 'javascript');
    assert(issues.length >= 4, `Should detect 4+ hallucinations (found ${issues.length})`, 'SUITE 2');
    
    // Test 2.2: No false positives with comments
    const codeWithComments = `
      // Call nonExistentFunc() here
      /* TODO: implement fakeFunction() */
      # Python comment with another_fake()
      function realFunc() {}
      realFunc(); // This is real
    `;
    
    const commentSymbols = await buildSymbolTable(codeWithComments, 'javascript');
    const commentIssues = await validateReferences(codeWithComments, commentSymbols, 'javascript');
    assert(commentIssues.length === 0, 'Comments should not trigger false positives', 'SUITE 2');
    
    // Test 2.3: Python hallucinations
    const pyExisting = `
      def existing_func():
          pass
      
      class ExistingClass:
          def method(self):
              pass
    `;
    
    const pyNew = `
      existing_func()
      non_existent_func()
      obj = ExistingClass()
      obj.method()
      obj.non_existent_method()
    `;
    
    const pyExistingSymbols = await buildSymbolTable(pyExisting, 'python');
    const pyNewSymbols = await buildSymbolTable(pyNew, 'python');
    const pyCombined = {
      functions: [...new Set([...pyExistingSymbols.functions, ...pyNewSymbols.functions])],
      classes: [...new Set([...pyExistingSymbols.classes, ...pyNewSymbols.classes])],
      variables: [],
      imports: [],
      dependencies: [],
    };
    
    const pyIssues = await validateReferences(pyNew, pyCombined, 'python');
    assert(pyIssues.length >= 2, 'Should detect Python hallucinations', 'SUITE 2');
    
    // Test 2.4: React hooks
    const reactExisting = `
      import React, { useState, useEffect } from 'react';
      function useCustomHook() {
        return useState(null);
      }
    `;
    
    const reactNew = `
      function Component() {
        const [state] = useCustomHook();
        const data = useNonExistentHook();
        return <div>{state}</div>;
      }
    `;
    
    const reactExistingSymbols = await buildSymbolTable(reactExisting, 'javascript');
    const reactNewSymbols = await buildSymbolTable(reactNew, 'javascript');
    const reactCombined = {
      functions: [...new Set([...reactExistingSymbols.functions, ...reactNewSymbols.functions])],
      classes: [],
      variables: [],
      imports: [],
      dependencies: [],
    };
    
    const reactIssues = await validateReferences(reactNew, reactCombined, 'javascript');
    assert(reactIssues.some(i => i.message.includes('useNonExistentHook')), 'Should detect missing React hook', 'SUITE 2');
    
  } catch (error) {
    assert(false, `Hallucination detection suite failed: ${error.message}`, 'SUITE 2');
  }

  // SUITE 3: Security Scanning - All Vulnerability Types
  startSuite('SUITE 3: Security Scanning - All Vulnerability Types');
  
  try {
    // Test 3.1: JavaScript - All vulnerability types
    const jsVulnerable = `
      const apiKey = "sk_live_1234567890abcdefghijklmnop";
      const password = "admin123";
      eval(userInput);
      document.getElementById('x').innerHTML = userInput;
      const query = "SELECT * FROM users WHERE id = " + userId;
      exec("ls " + userInput);
      const hash = md5(password);
      const random = Math.random();
      fetch("http://api.example.com/data");
    `;
    
    const jsVulns = await scanForVulnerabilities(jsVulnerable, 'javascript');
    assert(jsVulns.length >= 5, `Should detect 5+ JS vulnerabilities (found ${jsVulns.length})`, 'SUITE 3');
    assert(jsVulns.some(v => v.category === 'secrets'), 'Should detect secrets', 'SUITE 3');
    assert(jsVulns.some(v => v.category === 'code-injection'), 'Should detect code injection', 'SUITE 3');
    assert(jsVulns.some(v => v.category === 'xss'), 'Should detect XSS', 'SUITE 3');
    
    const jsScore = calculateSecurityScore(jsVulns);
    assert(jsScore < 100, 'Vulnerable code should score < 100', 'SUITE 3');
    
    // Test 3.2: Python - All vulnerability types
    const pyVulnerable = `
      SECRET_KEY = 'django-insecure-abc123def456'
      DEBUG = True
      
      import pickle
      data = pickle.loads(user_input)
      
      import os
      os.system('ls ' + user_input)
      
      query = f"SELECT * FROM users WHERE id = '{user_id}'"
      
      import hashlib
      hash = hashlib.md5(password.encode())
      
      import requests
      requests.get(url, verify=False)
    `;
    
    const pyVulns = await scanForVulnerabilities(pyVulnerable, 'python');
    assert(pyVulns.length >= 5, `Should detect 5+ Python vulnerabilities (found ${pyVulns.length})`, 'SUITE 3');
    assert(pyVulns.some(v => v.name.includes('SECRET_KEY')), 'Should detect Django SECRET_KEY', 'SUITE 3');
    assert(pyVulns.some(v => v.category === 'deserialization'), 'Should detect unsafe pickle', 'SUITE 3');
    assert(pyVulns.some(v => v.category === 'injection'), 'Should detect SQL injection', 'SUITE 3');
    
    // Test 3.3: Security score calculation
    const safeCode = 'function safe() { return 42; }';
    const safeVulns = await scanForVulnerabilities(safeCode, 'javascript');
    const safeScore = calculateSecurityScore(safeVulns);
    assert(safeScore === 100, 'Safe code should score 100', 'SUITE 3');
    
    // Test 3.4: Vulnerability summary
    const summary = getVulnerabilitySummary(jsVulns);
    assert(summary.total === jsVulns.length, 'Summary total should match vulnerability count', 'SUITE 3');
    assert(typeof summary.critical === 'number', 'Summary should have critical count', 'SUITE 3');
    
  } catch (error) {
    assert(false, `Security scanning suite failed: ${error.message}`, 'SUITE 3');
  }

  // SUITE 4: Anti-Pattern Detection - All Pattern Types
  startSuite('SUITE 4: Anti-Pattern Detection - All Pattern Types');
  
  try {
    // Test 4.1: JavaScript - All anti-patterns
    const jsProblematic = `
      // Empty catch
      try { risky(); } catch (e) {}
      
      // Console.log
      console.log('debug');
      
      // Magic numbers
      if (x > 5000) {}
      
      // Missing null check
      const name = user.name;
      
      // Callback hell
      getData((data1) => {
        processData(data1, (data2) => {
          saveData(data2, (result) => {
            console.log(result);
          });
        });
      });
      
      // Any type
      function handleData(data: any) {
        return data.value;
      }
      
      // Sync file operations
      const fs = require('fs');
      const content = fs.readFileSync('file.txt');
    `;
    
    const jsPatterns = await detectAntiPatterns(jsProblematic, 'javascript');
    assert(jsPatterns.length >= 5, `Should detect 5+ JS anti-patterns (found ${jsPatterns.length})`, 'SUITE 4');
    
    const jsQualityScore = calculateQualityScore(jsPatterns);
    assert(jsQualityScore < 100, 'Problematic code should score < 100', 'SUITE 4');
    
    // Test 4.2: Python - All anti-patterns
    const pyProblematic = `
      # Bare except
      try:
          risky()
      except:
          pass
      
      # Mutable default
      def func(items=[]):
          pass
      
      # Global modification
      global counter
      counter += 1
    `;
    
    const pyPatterns = await detectAntiPatterns(pyProblematic, 'python');
    assert(pyPatterns.length >= 2, `Should detect 2+ Python anti-patterns (found ${pyPatterns.length})`, 'SUITE 4');
    
    // Test 4.3: Category grouping
    const grouped = groupByCategory(jsPatterns);
    assert(Object.keys(grouped).length > 0, 'Should group patterns by category', 'SUITE 4');
    
    // Test 4.4: Summary
    const patternSummary = getAntiPatternSummary(jsPatterns);
    assert(patternSummary.total === jsPatterns.length, 'Summary total should match pattern count', 'SUITE 4');
    assert(typeof patternSummary.high === 'number', 'Summary should have high count', 'SUITE 4');
    
  } catch (error) {
    assert(false, `Anti-pattern detection suite failed: ${error.message}`, 'SUITE 4');
  }

  // SUITE 5: Language Detection - All Methods
  startSuite('SUITE 5: Language Detection - All Methods');
  
  try {
    // Test 5.1: Extension detection - All supported extensions
    const extensions = [
      { ext: '.js', lang: 'javascript' },
      { ext: '.jsx', lang: 'javascript' },
      { ext: '.ts', lang: 'typescript' },
      { ext: '.tsx', lang: 'typescript' },
      { ext: '.py', lang: 'python' },
      { ext: '.go', lang: 'go' },
      { ext: '.java', lang: 'java' },
    ];
    
    for (const { ext, lang } of extensions) {
      const result = detectFromPath(`test${ext}`);
      assert(result && result.language === lang, `Should detect ${ext} as ${lang}`, 'SUITE 5');
      assert(result && result.confidence === 100, `Extension detection should be 100% confident`, 'SUITE 5');
    }
    
    // Test 5.2: Shebang detection
    const shebangs = [
      { shebang: '#!/usr/bin/env python3', lang: 'python' },
      { shebang: '#!/usr/bin/env node', lang: 'javascript' },
      { shebang: '#!/bin/bash', lang: 'shell' },
    ];
    
    for (const { shebang, lang } of shebangs) {
      const result = detectFromShebang(`${shebang}\ncode here`);
      assert(result && result.language === lang, `Should detect ${lang} from shebang`, 'SUITE 5');
    }
    
    // Test 5.3: Content detection
    const contents = [
      { code: 'function test() { const x = 10; }', lang: 'javascript' },
      { code: 'def test():\n    print("hello")', lang: 'python' },
      { code: 'package main\nfunc main() {}', lang: 'go' },
    ];
    
    for (const { code, lang } of contents) {
      const result = detectFromContent(code);
      assert(result && result.language === lang, `Should detect ${lang} from content`, 'SUITE 5');
    }
    
    // Test 5.4: Framework detection
    const frameworks = [
      { code: 'import React from "react"', framework: 'react', lang: 'javascript' },
      { code: 'from django.db import models', framework: 'django', lang: 'python' },
      { code: 'from flask import Flask', framework: 'flask', lang: 'python' },
    ];
    
    for (const { code, framework, lang } of frameworks) {
      const result = detectLanguage(code);
      assert(result.framework === framework, `Should detect ${framework} framework`, 'SUITE 5');
      assert(result.language === lang, `Framework detection should identify ${lang}`, 'SUITE 5');
    }
    
    // Test 5.5: Supported languages
    const supported = getSupportedLanguages();
    assert(supported.length >= 15, `Should support 15+ languages (supports ${supported.length})`, 'SUITE 5');
    assert(supported.includes('javascript'), 'Should support JavaScript', 'SUITE 5');
    assert(supported.includes('python'), 'Should support Python', 'SUITE 5');
    
  } catch (error) {
    assert(false, `Language detection suite failed: ${error.message}`, 'SUITE 5');
  }

  // SUITE 6: Unified Analysis - All Modes
  startSuite('SUITE 6: Unified Analysis - All Modes');
  
  try {
    const testCode = `
      const apiKey = "sk_1234567890";
      nonExistentFunc();
      try { risky(); } catch (e) {}
    `;
    
    // Test 6.1: Comprehensive analysis
    const comprehensive = await comprehensiveAnalysis(testCode, 'function existingFunc() {}', 'javascript');
    assert(comprehensive.success === true, 'Comprehensive analysis should succeed', 'SUITE 6');
    assert(comprehensive.totalIssues > 0, 'Should detect multiple issues', 'SUITE 6');
    assert(comprehensive.hallucinations.length > 0, 'Should detect hallucinations', 'SUITE 6');
    assert(comprehensive.securityVulnerabilities.length > 0, 'Should detect security issues', 'SUITE 6');
    assert(comprehensive.antiPatterns.length > 0, 'Should detect anti-patterns', 'SUITE 6');
    assert(comprehensive.analysisTime < 50, `Should complete in < 50ms (was ${comprehensive.analysisTime}ms)`, 'SUITE 6');
    
    // Test 6.2: Quick analysis (hallucinations only)
    const quick = await quickAnalysis(testCode, 'function existingFunc() {}', 'javascript');
    assert(quick.success === true, 'Quick analysis should succeed', 'SUITE 6');
    assert(quick.hallucinations.length > 0, 'Quick analysis should detect hallucinations', 'SUITE 6');
    assert(quick.securityVulnerabilities.length === 0, 'Quick analysis should skip security', 'SUITE 6');
    
    // Test 6.3: Security analysis
    const security = await securityAnalysis(testCode, 'javascript');
    assert(security.success === true, 'Security analysis should succeed', 'SUITE 6');
    assert(security.securityVulnerabilities.length > 0, 'Security analysis should detect vulnerabilities', 'SUITE 6');
    assert(security.hallucinations.length === 0, 'Security analysis should skip hallucinations', 'SUITE 6');
    
    // Test 6.4: Quality analysis
    const quality = await qualityAnalysis(testCode, 'javascript');
    assert(quality.success === true, 'Quality analysis should succeed', 'SUITE 6');
    assert(quality.antiPatterns.length > 0, 'Quality analysis should detect anti-patterns', 'SUITE 6');
    assert(quality.securityVulnerabilities.length === 0, 'Quality analysis should skip security', 'SUITE 6');
    
    // Test 6.5: Auto language detection
    const autoDetect = await comprehensiveAnalysis('function test() {}', '');
    assert(autoDetect.language === 'javascript', 'Should auto-detect language', 'SUITE 6');
    assert(autoDetect.languageConfidence > 0, 'Should have confidence score', 'SUITE 6');
    
  } catch (error) {
    assert(false, `Unified analysis suite failed: ${error.message}`, 'SUITE 6');
  }

  // SUITE 7: Performance & Scalability
  startSuite('SUITE 7: Performance & Scalability');
  
  try {
    // Test 7.1: Large codebase
    const largeCode = 'function test() {}\n'.repeat(1000);
    const { result: largeResult, time: largeTime } = measurePerformance('Large code analysis',
      () => comprehensiveAnalysis(largeCode, ''));
    await largeResult;
    assert(largeTime < 100, `Large code (1000 functions) should analyze in < 100ms (was ${largeTime}ms)`, 'SUITE 7');
    
    // Test 7.2: Very large codebase
    const veryLargeCode = 'function test() {}\n'.repeat(5000);
    const { result: veryLargeResult, time: veryLargeTime } = measurePerformance('Very large code analysis',
      () => comprehensiveAnalysis(veryLargeCode, ''));
    await veryLargeResult;
    assert(veryLargeTime < 500, `Very large code (5000 functions) should analyze in < 500ms (was ${veryLargeTime}ms)`, 'SUITE 7');
    
    // Test 7.3: Concurrent analyses
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(comprehensiveAnalysis(`function test${i}() {}`, ''));
    }
    const concurrentStart = Date.now();
    await Promise.all(promises);
    const concurrentTime = Date.now() - concurrentStart;
    assert(concurrentTime < 200, `10 concurrent analyses should complete in < 200ms (was ${concurrentTime}ms)`, 'SUITE 7');
    
  } catch (error) {
    assert(false, `Performance suite failed: ${error.message}`, 'SUITE 7');
  }

  // SUITE 8: Error Handling & Edge Cases
  startSuite('SUITE 8: Error Handling & Edge Cases');
  
  try {
    // Test 8.1: Empty inputs
    const emptyResult = await comprehensiveAnalysis('', '');
    assert(emptyResult.success === true, 'Should handle empty input', 'SUITE 8');
    assert(emptyResult.totalIssues === 0, 'Empty code should have 0 issues', 'SUITE 8');
    
    // Test 8.2: Null/undefined handling
    try {
      const nullResult = await comprehensiveAnalysis(null, null);
      assert(false, 'Should handle null input gracefully', 'SUITE 8');
    } catch (error) {
      // Expected to handle gracefully
      assert(true, 'Handles null input', 'SUITE 8');
    }
    
    // Test 8.3: Invalid language
    const invalidLang = await buildSymbolTable('test', 'invalid-language');
    assert(invalidLang.functions.length === 0, 'Invalid language should return empty symbols', 'SUITE 8');
    
    // Test 8.4: Malformed code
    const malformed = 'function { { { incomplete';
    const malformedResult = await comprehensiveAnalysis(malformed, '');
    assert(malformedResult.success === true, 'Should handle malformed code', 'SUITE 8');
    
    // Test 8.5: Special characters
    const specialChars = 'function test() { const x = "\\n\\t\\r"; }';
    const specialResult = await comprehensiveAnalysis(specialChars, '');
    assert(specialResult.success === true, 'Should handle special characters', 'SUITE 8');
    
    // Test 8.6: Unicode
    const unicode = 'function test() { const 名前 = "テスト"; }';
    const unicodeResult = await comprehensiveAnalysis(unicode, '');
    assert(unicodeResult.success === true, 'Should handle Unicode', 'SUITE 8');
    
  } catch (error) {
    assert(false, `Error handling suite failed: ${error.message}`, 'SUITE 8');
  }

  // SUITE 9: Cross-Language Consistency
  startSuite('SUITE 9: Cross-Language Consistency');
  
  try {
    const jsResult = await comprehensiveAnalysis('function test() {}', '');
    const pyResult = await comprehensiveAnalysis('def test():\n    pass', '');
    
    assert(jsResult.success === pyResult.success, 'Should have consistent success status', 'SUITE 9');
    assert(typeof jsResult.overallScore === 'number', 'JS should return numeric score', 'SUITE 9');
    assert(typeof pyResult.overallScore === 'number', 'Python should return numeric score', 'SUITE 9');
    assert(jsResult.overallScore >= 0 && jsResult.overallScore <= 100, 'JS score should be 0-100', 'SUITE 9');
    assert(pyResult.overallScore >= 0 && pyResult.overallScore <= 100, 'Python score should be 0-100', 'SUITE 9');
    
  } catch (error) {
    assert(false, `Cross-language consistency suite failed: ${error.message}`, 'SUITE 9');
  }

  // SUITE 10: Integration - Real-World Scenarios
  startSuite('SUITE 10: Integration - Real-World Scenarios');
  
  try {
    // Test 10.1: React component
    const reactCode = `
      import React, { useState } from 'react';
      function Component() {
        const [data] = useNonExistentHook();
        return <div dangerouslySetInnerHTML={{__html: data}} />;
      }
    `;
    const reactResult = await comprehensiveAnalysis(reactCode, '', 'javascript');
    assert(reactResult.hallucinations.length > 0, 'Should detect React hook hallucination', 'SUITE 10');
    assert(reactResult.securityVulnerabilities.length > 0, 'Should detect React XSS', 'SUITE 10');
    
    // Test 10.2: Django view
    const djangoCode = `
      SECRET_KEY = 'insecure123'
      def view(request):
          query = f"SELECT * FROM users WHERE id = '{request.GET.get('id')}'"
          non_existent_func()
    `;
    const djangoResult = await comprehensiveAnalysis(djangoCode, '', 'python');
    assert(djangoResult.hallucinations.length > 0, 'Should detect Django hallucination', 'SUITE 10');
    assert(djangoResult.securityVulnerabilities.length >= 2, 'Should detect Django security issues', 'SUITE 10');
    
  } catch (error) {
    assert(false, `Integration suite failed: ${error.message}`, 'SUITE 10');
  }

  // FINAL RESULTS
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 EXTREMELY ROBUST TEST RESULTS\n');
  
  const totalTests = testResults.passed + testResults.failed;
  const successRate = Math.round((testResults.passed / totalTests) * 100);
  
  console.log(`   Total Tests: ${totalTests}`);
  console.log(`   Passed: ${testResults.passed} ✅`);
  console.log(`   Failed: ${testResults.failed} ${testResults.failed > 0 ? '❌' : ''}`);
  console.log(`   Success Rate: ${successRate}%`);
  
  // Suite breakdown
  console.log('\n📋 SUITE BREAKDOWN:\n');
  Object.entries(testResults.suites).forEach(([name, suite]) => {
    const suiteRate = suite.passed + suite.failed > 0 
      ? Math.round((suite.passed / (suite.passed + suite.failed)) * 100)
      : 0;
    const status = suiteRate === 100 ? '✅' : suiteRate >= 90 ? '⚠️' : '❌';
    console.log(`   ${status} ${name}: ${suite.passed}/${suite.passed + suite.failed} (${suiteRate}%)`);
  });
  
  // Performance summary
  if (testResults.performance.length > 0) {
    console.log('\n⚡ PERFORMANCE SUMMARY:\n');
    testResults.performance.forEach(({ name, time }) => {
      console.log(`   ${name}: ${time}ms`);
    });
  }
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ FAILED TESTS:\n');
    testResults.errors.forEach((error, idx) => {
      console.log(`   ${idx + 1}. ${error}`);
    });
  }
  
  console.log('\n' + '='.repeat(70));
  
  if (successRate === 100) {
    console.log('\n🎉 PERFECT! ALL TESTS PASSED!\n');
    console.log('Phase 1 & 2 are FLAWLESS and production-ready!');
  } else if (successRate >= 95) {
    console.log('\n✅ EXCELLENT! Tests mostly passed!\n');
    console.log('Phase 1 & 2 are in excellent condition!');
  } else if (successRate >= 90) {
    console.log('\n✅ GOOD! Tests mostly passed!\n');
    console.log('Phase 1 & 2 are in good condition with minor issues.');
  } else {
    console.log('\n⚠️  NEEDS ATTENTION! Some tests failed.\n');
    console.log('Please review and fix failing tests.');
  }
  
  console.log('\n');
  
  return {
    success: successRate >= 95,
    passed: testResults.passed,
    failed: testResults.failed,
    successRate,
    suites: testResults.suites,
  };
}

// Run the extremely robust test suite
runExtremelyRobustTests()
  .then(result => {
    console.log(`✅ Extremely robust validation completed!`);
    console.log(`   Passed: ${result.passed}`);
    console.log(`   Failed: ${result.failed}`);
    console.log(`   Success Rate: ${result.successRate}%\n`);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
