/**
 * Reference Validator
 * 
 * Validates that all function calls, class references, and variable uses
 * exist in the codebase. Detects AI hallucinations.
 */

import { SymbolTable, Issue } from '../types/tools.js';
import { logger } from '../utils/logger.js';

/**
 * Validate all references in new code against symbol table
 */
export async function validateReferences(
  newCode: string,
  symbolTable: SymbolTable,
  language: string
): Promise<Issue[]> {
  logger.debug('Validating references...');

  const issues: Issue[] = [];

  try {
    // Extract function calls from new code
    const functionCalls = extractFunctionCalls(newCode, language);
    
    for (const call of functionCalls) {
      // Check if function exists in symbol table
      if (!symbolTable.functions.includes(call.name)) {
        // Check if it's a built-in or standard library function
        if (!isBuiltInFunction(call.name, language)) {
          issues.push({
            type: 'nonExistentFunction',
            severity: 'high',
            message: `Function '${call.name}' does not exist in codebase`,
            line: call.line,
            column: call.column,
            code: call.code,
            suggestion: `Available functions: ${getSimilarFunctions(call.name, symbolTable.functions).join(', ') || 'none found'}`,
            confidence: 90,
          });
        }
      }
    }

    // Extract class references
    const classRefs = extractClassReferences(newCode, language);
    
    for (const ref of classRefs) {
      if (!symbolTable.classes.includes(ref.name) && !isBuiltInClass(ref.name, language)) {
        issues.push({
          type: 'nonExistentClass',
          severity: 'high',
          message: `Class '${ref.name}' does not exist in codebase`,
          line: ref.line,
          column: ref.column,
          code: ref.code,
          suggestion: `Available classes: ${symbolTable.classes.join(', ') || 'none found'}`,
          confidence: 85,
        });
      }
    }

    // Extract variable references
    const varRefs = extractVariableReferences(newCode, language);
    
    for (const ref of varRefs) {
      if (!symbolTable.variables.includes(ref.name) && !isBuiltInVariable(ref.name, language)) {
        issues.push({
          type: 'undefinedVariable',
          severity: 'critical',
          message: `Variable '${ref.name}' is not defined`,
          line: ref.line,
          column: ref.column,
          code: ref.code,
          suggestion: 'Declare this variable or check for typos',
          confidence: 95,
        });
      }
    }

    logger.debug(`Found ${issues.length} reference issues`);
  } catch (error) {
    logger.error('Error validating references:', error);
  }

  return issues;
}

/**
 * Extract function calls from code
 */
function extractFunctionCalls(code: string, language: string): Array<{
  name: string;
  line: number;
  column: number;
  code: string;
}> {
  const calls: Array<{ name: string; line: number; column: number; code: string }> = [];
  const lines = code.split('\n');

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Skip comment lines
    if (trimmedLine.startsWith('//') || 
        trimmedLine.startsWith('/*') || 
        trimmedLine.startsWith('*') ||
        trimmedLine.startsWith('#')) {
      return;
    }
    
    // Remove inline comments before processing
    const codeWithoutComments = line.split('//')[0];
    
    // Pattern 1: Extract method calls: object.method(...) or obj.nested.method(...)
    const methodCallPattern = /\.(\w+)\s*\(/g;
    let match;
    while ((match = methodCallPattern.exec(codeWithoutComments)) !== null) {
      const methodName = match[1];
      if (!isKeyword(methodName, language)) {
        calls.push({
          name: methodName,
          line: index + 1,
          column: match.index,
          code: line.trim(),
        });
      }
    }

    // Pattern 2: Extract standalone function calls: functionName(...)
    // Match function calls that are NOT preceded by a dot
    const standaloneFuncPattern = /(?:^|[^\w.])(\w+)\s*\(/g;
    while ((match = standaloneFuncPattern.exec(codeWithoutComments)) !== null) {
      const funcName = match[1];
      // Filter out keywords, function definitions, and class definitions
      if (!isKeyword(funcName, language) && 
          !trimmedLine.startsWith('function') &&
          !trimmedLine.startsWith('def') &&
          !codeWithoutComments.includes('function ' + funcName)) {
        calls.push({
          name: funcName,
          line: index + 1,
          column: match.index,
          code: line.trim(),
        });
      }
    }
  });

  return calls;
}

/**
 * Extract class references from code
 */
function extractClassReferences(code: string, language: string): Array<{
  name: string;
  line: number;
  column: number;
  code: string;
}> {
  const refs: Array<{ name: string; line: number; column: number; code: string }> = [];
  const lines = code.split('\n');

  // Pattern for class instantiation: new ClassName(...)
  const newPattern = /new\s+(\w+)\s*\(/g;

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Skip comment lines
    if (trimmedLine.startsWith('//') || 
        trimmedLine.startsWith('/*') || 
        trimmedLine.startsWith('*') ||
        trimmedLine.startsWith('#')) {
      return;
    }
    
    // Remove inline comments before processing
    const codeWithoutComments = line.split('//')[0];
    
    let match;
    while ((match = newPattern.exec(codeWithoutComments)) !== null) {
      refs.push({
        name: match[1],
        line: index + 1,
        column: match.index,
        code: line.trim(),
      });
    }
  });

  return refs;
}

/**
 * Extract variable references from code
 */
function extractVariableReferences(code: string, language: string): Array<{
  name: string;
  line: number;
  column: number;
  code: string;
}> {
  const refs: Array<{ name: string; line: number; column: number; code: string }> = [];
  // For now, return empty array - this is complex and prone to false positives
  // Will implement more sophisticated variable tracking in next iteration
  return refs;
}

/**
 * Check if a function is a built-in for the language
 */
function isBuiltInFunction(name: string, language: string): boolean {
  const builtIns: Record<string, string[]> = {
    javascript: [
      // Global functions
      'console', 'parseInt', 'parseFloat', 'setTimeout', 'setInterval', 
      'clearTimeout', 'clearInterval', 'isNaN', 'isFinite', 'eval',
      // Web APIs
      'fetch', 'URL', 'URLSearchParams', 'FormData', 'Request', 'Response',
      'WebSocket', 'EventSource', 'Blob', 'File', 'FileReader',
      'localStorage', 'sessionStorage', 'document', 'window', 'navigator',
      // Built-in objects (constructor functions)
      'Promise', 'Array', 'Object', 'JSON', 'Math', 'Date', 'String', 
      'Number', 'Boolean', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet',
      // Common methods (for console.log, Math.floor, etc.)
      'log', 'error', 'warn', 'info', 'debug', 'trace', 'assert',
      'floor', 'ceil', 'round', 'abs', 'max', 'min', 'random',
      'stringify', 'parse',
      'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'race',
      'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'map', 'filter', 
      'reduce', 'forEach', 'find', 'findIndex', 'includes', 'indexOf',
      'keys', 'values', 'entries', 'assign', 'freeze', 'seal'
    ],
    typescript: [
      // Same as JavaScript
      'console', 'parseInt', 'parseFloat', 'setTimeout', 'setInterval', 
      'clearTimeout', 'clearInterval', 'isNaN', 'isFinite', 'eval',
      // Web APIs
      'fetch', 'URL', 'URLSearchParams', 'FormData', 'Request', 'Response',
      'WebSocket', 'EventSource', 'Blob', 'File', 'FileReader',
      'localStorage', 'sessionStorage', 'document', 'window', 'navigator',
      // Built-in objects (constructor functions)
      'Promise', 'Array', 'Object', 'JSON', 'Math', 'Date', 'String', 
      'Number', 'Boolean', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet',
      // Common methods (for console.log, Math.floor, etc.)
      'log', 'error', 'warn', 'info', 'debug', 'trace', 'assert',
      'floor', 'ceil', 'round', 'abs', 'max', 'min', 'random',
      'stringify', 'parse',
      'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'race',
      'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'map', 'filter', 
      'reduce', 'forEach', 'find', 'findIndex', 'includes', 'indexOf',
      'keys', 'values', 'entries', 'assign', 'freeze', 'seal'
    ],
    python: ['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'open', 'input', 'type', 'isinstance', 'sum', 'min', 'max', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter'],
    go: ['make', 'len', 'cap', 'append', 'copy', 'delete', 'print', 'println', 'panic', 'recover'],
  };

  return builtIns[language]?.includes(name) || false;
}

/**
 * Check if a class is built-in
 */
function isBuiltInClass(name: string, language: string): boolean {
  const builtIns: Record<string, string[]> = {
    javascript: ['Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Promise', 'Map', 'Set'],
    typescript: ['Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Promise', 'Map', 'Set'],
    python: ['list', 'dict', 'set', 'tuple', 'str', 'int', 'float', 'bool', 'Exception', 'ValueError', 'TypeError'],
    go: [],
  };

  return builtIns[language]?.includes(name) || false;
}

/**
 * Check if a variable is built-in
 */
function isBuiltInVariable(name: string, language: string): boolean {
  const builtIns: Record<string, string[]> = {
    javascript: ['window', 'document', 'console', 'process', 'global', 'undefined', 'null', 'NaN', 'Infinity'],
    typescript: ['window', 'document', 'console', 'process', 'global', 'undefined', 'null', 'NaN', 'Infinity'],
    python: ['True', 'False', 'None', '__name__', '__file__', '__doc__'],
    go: ['nil', 'true', 'false'],
  };

  return builtIns[language]?.includes(name) || false;
}

/**
 * Check if a name is a language keyword
 */
function isKeyword(name: string, language: string): boolean {
  const keywords: Record<string, string[]> = {
    javascript: ['if', 'else', 'for', 'while', 'return', 'function', 'const', 'let', 'var', 'class', 'new', 'this', 'typeof', 'instanceof'],
    typescript: ['if', 'else', 'for', 'while', 'return', 'function', 'const', 'let', 'var', 'class', 'new', 'this', 'typeof', 'instanceof', 'interface', 'type'],
    python: ['if', 'elif', 'else', 'for', 'while', 'return', 'def', 'class', 'import', 'from', 'as', 'with', 'lambda', 'yield'],
    go: ['if', 'else', 'for', 'return', 'func', 'type', 'struct', 'interface', 'go', 'defer', 'range', 'var', 'const'],
  };

  return keywords[language]?.includes(name) || false;
}

/**
 * Find similar function names (for suggestions)
 */
function getSimilarFunctions(target: string, available: string[]): string[] {
  return available
    .filter(name => {
      // Simple similarity: starts with same letter or contains target
      return name[0].toLowerCase() === target[0].toLowerCase() ||
             name.toLowerCase().includes(target.toLowerCase()) ||
             target.toLowerCase().includes(name.toLowerCase());
    })
    .slice(0, 3); // Return top 3 suggestions
}
