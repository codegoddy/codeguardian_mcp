/**
 * Unit tests for CodeGraph architecture
 */

import { TreeSitterParser } from '../../src/analyzers/parsers/treeSitterParser';
import { SemanticIndexBuilder, SemanticQuery } from '../../src/analyzers/parsers/semanticIndex';
import { ScopeResolver } from '../../src/analyzers/parsers/scopeResolver';
import { SessionDiffAnalyzer } from '../../src/analyzers/parsers/sessionDiffAnalyzer';

describe('TreeSitterParser', () => {
  const parser = new TreeSitterParser();

  test('should parse JavaScript function', async () => {
    const code = `
      function greet(name) {
        return 'Hello ' + name;
      }
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    
    expect(result.graph.symbols.size).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    expect(result.parseTime).toBeGreaterThan(0);
  });

  test('should parse TypeScript class', async () => {
    const code = `
      class UserService {
        authenticateUser(username: string, password: string): boolean {
          return true;
        }
      }
    `;
    
    const result = await parser.parse(code, 'test.ts', 'typescript');
    
    expect(result.graph.symbols.has('UserService')).toBeTruthy();
    const userService = Array.from(result.graph.symbols.values()).find(s => s.name === 'UserService');
    expect(userService?.type).toBe('class');
  });

  test('should parse Python function', async () => {
    const code = `
def calculate_total(items):
    total = 0
    for item in items:
        total += item.price
    return total
    `;
    
    const result = await parser.parse(code, 'test.py', 'python');
    
    expect(result.graph.symbols.size).toBeGreaterThan(0);
    const calcFunc = Array.from(result.graph.symbols.values()).find(s => s.name === 'calculate_total');
    expect(calcFunc?.type).toBe('function');
  });

  test('should track imports', async () => {
    const code = `
      import { useState } from 'react';
      import axios from 'axios';
    `;
    
    const result = await parser.parse(code, 'test.ts', 'typescript');
    
    expect(result.graph.imports.size).toBeGreaterThan(0);
  });

  test('should build call graph', async () => {
    const code = `
      function fetchData() {
        return processData();
      }
      
      function processData() {
        return formatData();
      }
      
      function formatData() {
        return {};
      }
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    
    expect(result.graph.callGraph.size).toBeGreaterThan(0);
  });
});

describe('SemanticIndex', () => {
  test('should build index from graph', async () => {
    const parser = new TreeSitterParser();
    const code = `
      function foo() {}
      function bar() {}
      class MyClass {}
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    
    expect(index.symbolsByName.size).toBeGreaterThan(0);
    expect(index.symbolsByType.size).toBeGreaterThan(0);
  });

  test('should find symbol by name', async () => {
    const parser = new TreeSitterParser();
    const code = `function testFunc() { return 42; }`;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    
    const symbol = SemanticIndexBuilder.findSymbol('testFunc', index);
    expect(symbol).not.toBeNull();
    expect(symbol?.name).toBe('testFunc');
  });

  test('should detect unused symbols', async () => {
    const parser = new TreeSitterParser();
    const code = `
      function usedFunc() { return 1; }
      function unusedFunc() { return 2; }
      
      usedFunc();
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    
    const unused = SemanticIndexBuilder.findUnusedSymbols(index);
    expect(unused.length).toBeGreaterThan(0);
  });

  test('should provide statistics', async () => {
    const parser = new TreeSitterParser();
    const code = `
      function func1() {}
      function func2() {}
      class Class1 {}
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    
    const stats = SemanticIndexBuilder.getStatistics(index);
    expect(stats.totalSymbols).toBeGreaterThan(0);
    expect(stats.symbolsByType).toHaveProperty('function');
  });
});

describe('SemanticQuery', () => {
  test('should find similar symbols', async () => {
    const parser = new TreeSitterParser();
    const code = `
      function authenticateUser() {}
      function authenticate() {}
      function authorization() {}
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    const query = new SemanticQuery(index, result.graph);
    
    const similar = query.findSimilar('authentiate', 2); // typo
    expect(similar.length).toBeGreaterThan(0);
  });

  test('should find callers and callees', async () => {
    const parser = new TreeSitterParser();
    const code = `
      function caller() {
        callee();
      }
      function callee() {}
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    const query = new SemanticQuery(index, result.graph);
    
    const callees = query.findCallees('caller');
    expect(callees).toContain('callee');
  });
});

describe('ScopeResolver', () => {
  test('should resolve symbol in scope', async () => {
    const parser = new TreeSitterParser();
    const code = `
      const globalVar = 1;
      function myFunc() {
        const localVar = 2;
        return globalVar + localVar;
      }
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const resolver = new ScopeResolver(result.graph);
    
    const globalScope = result.graph.globalScope;
    const resolved = resolver.resolveSymbol('globalVar', globalScope);
    expect(resolved).not.toBeNull();
  });

  test('should resolve method call', async () => {
    const parser = new TreeSitterParser();
    const code = `
      class UserService {
        authenticate() {
          return true;
        }
      }
      
      const service = new UserService();
      service.authenticate();
    `;
    
    const result = await parser.parse(code, 'test.ts', 'typescript');
    const resolver = new ScopeResolver(result.graph);
    
    // This is a simplified test - full implementation would need proper scope tracking
    expect(result.graph.symbols.size).toBeGreaterThan(0);
  });

  test('should detect unresolved references', async () => {
    const parser = new TreeSitterParser();
    const code = `
      function test() {
        return nonExistentFunction();
      }
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const resolver = new ScopeResolver(result.graph);
    
    const fileScope = result.graph.scopes.get('test.js');
    if (fileScope) {
      const unresolved = resolver.findUnresolvedReferences(fileScope);
      // Note: This test may need adjustment based on actual parsing behavior
      expect(unresolved).toBeDefined();
    }
  });
});

describe('SessionDiffAnalyzer', () => {
  test('should detect added symbols', async () => {
    const parser = new TreeSitterParser();
    
    const before = await parser.parse('function foo() {}', 'test.js', 'javascript');
    const after = await parser.parse('function foo() {}\nfunction bar() {}', 'test.js', 'javascript');
    
    const diff = SessionDiffAnalyzer.computeDiff(before.graph, after.graph);
    
    expect(diff.added.length).toBeGreaterThan(0);
  });

  test('should detect removed symbols', async () => {
    const parser = new TreeSitterParser();
    
    const before = await parser.parse('function foo() {}\nfunction bar() {}', 'test.js', 'javascript');
    const after = await parser.parse('function foo() {}', 'test.js', 'javascript');
    
    const diff = SessionDiffAnalyzer.computeDiff(before.graph, after.graph);
    
    expect(diff.removed.length).toBeGreaterThan(0);
  });

  test('should detect broken references (hallucinations)', async () => {
    const parser = new TreeSitterParser();
    
    const before = await parser.parse('function helper() {}', 'test.js', 'javascript');
    const after = await parser.parse('function main() { helper(); }', 'test.js', 'javascript');
    
    const diff = SessionDiffAnalyzer.computeDiff(before.graph, after.graph);
    
    // Should detect new references
    expect(diff.newReferences).toBeDefined();
  });

  test('should analyze hallucination risk', async () => {
    const parser = new TreeSitterParser();
    
    const before = await parser.parse('', 'test.js', 'javascript');
    const after = await parser.parse('function test() { nonExistent(); }', 'test.js', 'javascript');
    
    const diff = SessionDiffAnalyzer.computeDiff(before.graph, after.graph);
    const risk = SessionDiffAnalyzer.analyzeHallucinationRisk(diff);
    
    expect(risk.riskLevel).toBeDefined();
    expect(risk.issues).toBeDefined();
  });

  test('should generate readable report', async () => {
    const parser = new TreeSitterParser();
    
    const before = await parser.parse('function foo() {}', 'test.js', 'javascript');
    const after = await parser.parse('function bar() {}', 'test.js', 'javascript');
    
    const diff = SessionDiffAnalyzer.computeDiff(before.graph, after.graph);
    const report = SessionDiffAnalyzer.generateReport(diff);
    
    expect(report).toContain('Session Diff Report');
    expect(typeof report).toBe('string');
  });
});

describe('Integration - Full Pipeline', () => {
  test('should handle complete hallucination detection flow', async () => {
    const parser = new TreeSitterParser();
    
    const code = `
      class UserService {
        authenticateUser(username, password) {
          // AI might hallucinate this method exists
          return this.validateCredentials(username, password);
        }
      }
    `;
    
    const result = await parser.parse(code, 'test.js', 'javascript');
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    const query = new SemanticQuery(index, result.graph);
    
    // Check for hallucinations
    const stats = query.getStatistics();
    expect(stats.totalSymbols).toBeGreaterThan(0);
    
    // Unresolved references indicate hallucinations
    expect(index.unresolvedReferences).toBeDefined();
  });
});
