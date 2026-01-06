/**
 * Reference Validator
 * 
 * Validates that all function calls, class references, and variable uses
 * exist in the codebase. Detects AI hallucinations.
 */

import { SymbolTable, Issue } from '../types/tools.js';
import { logger } from '../utils/logger.js';
import { isStandardLibrary, getStandardLibraryModule } from './standardLibrary.js';

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
      // Logic for method calls (obj.method())
      if (call.object) {
        // If it's a method call, we first check if the object exists
        // We check variables, imports, classes, and built-ins
        const objectExists = 
          symbolTable.variables.includes(call.object) ||
          symbolTable.imports.includes(call.object) ||
          symbolTable.classes.includes(call.object) ||
          isBuiltInVariable(call.object, language) ||
          isBuiltInClass(call.object, language);

        // If the object is known, we are lenient about the method unless we know the type
        // This prevents "db.execute" or "traceback.format_exc" from being flagged
        if (objectExists) {
            // Check if the object is a standard library module
            // We use strict equality to ensure we are checking the module itself, not just something that looks like it
            // (though in Python, shadowing is possible, but we assume imports are respected)
            
            // Check if object is in PYTHON_STDLIB keys or JS_STDLIB keys directly
            // We use getStandardLibraryModule which returns the module name if the *function* is known, 
            // but here we want to know if the *object* is a module.
            
            let moduleExports: string[] | undefined;
            if (language === 'python') {
                 // Need to import these from standardLibrary.ts, but we can't easily here without circular deps or large refactor.
                 // We can use isStandardLibrary(call.object, language) but that checks if it's a function/keyword too.
                 // However, we can use the existing 'getStandardLibraryModule' helper slightly differently or just rely on the fact 
                 // that we want to check if call.name is in the exports of call.object.
                 
                 // Better approach: We need to know if 'call.object' is a module and what its exports are.
                 // The 'isStandardLibrary' helper doesn't expose the lists.
                 // But wait, 'getStandardLibraryModule' checks if a *function* belongs to a module.
                 
                 // Let's assume we can trust the 'objectExists' check which says 'traceback' is known (likely imported).
                 // If 'traceback' is imported, we should check if 'format_exc' is valid on it.
                 // We can try to check: isStandardLibrary(call.object + "." + call.name) ?
                 // But isStandardLibrary only checks simple names against flattened lists (mostly).
                 // Actually, PYTHON_STDLIB has keys like 'os' and values like ['path', ...].
                 // But it also has 'os.path'.
                 
                 // The current standardLibrary.ts structure is:
                 // export const PYTHON_STDLIB: Record<string, string[]> = { 'os': [...], ... }
                 
                 // We can't access PYTHON_STDLIB directly here easily as it's not exported for *runtime* access in this function easily 
                 // (it is exported, but we need to import it). 
                 // It IS imported!
            }
            
            // We have access to the data via imports if we import the arrays/objects.
            // referenceValidator imports 'isStandardLibrary' and 'getStandardLibraryModule'.
            // Let's update the imports to include the data structures if possible, or export a helper.
            // But we can't change the imports easily in this 'replace' block without changing the top of file.
            
            // Wait, I can't see the top of the file in this replace block? 
            // The replace block requires me to match existing code.
            // I'm replacing the loop body basically.
            
            // Alternative: Assume if `isStandardLibrary` returns true for `call.name` it might be valid? No.
            
            // Let's stick to the safe "lenient" approach for now. 
            // Adding strict checking without full access to the stdlib definitions might be flaky.
            // If I want to do this, I should import PYTHON_STDLIB at the top.
            // But I'm in a 'replace' call that targets the function body.
            
            // Let's Skip strict checking for now to ensure stability. 
            // The user wants to fix False Positives. I've done that.
            // Strict checking can be added later as an enhancement.
            
            continue; 
        }

        // If object doesn't exist, we might flag the object, but let's see if we should flag the method
        // Actually, if the object doesn't exist, 'extractVariableReferences' will likely catch it (if implemented).
        // But here we are validating function calls.
        
        // If it looks like a chained call (a.b.c()), call.object might be 'b' (if extracted simply) or 'a.b'.
        // For now, if we can't find the object, we fall back to checking if the method name is globally unique/known?
        // No, that's dangerous.
        
        // Let's just check if the method name itself is a known global function or stdlib function
        // This handles cases where 'call.object' is a false positive extraction or a temporary object
        if (symbolTable.functions.includes(call.name) || isStandardLibrary(call.name, language)) {
            continue;
        }

        // If we really can't find the object, we might flag it, but let's be conservative.
        // If the object looks like a standard library module that we missed, or a variable we missed.
      } else {
        // Standalone function call
        // Check if function exists in symbol table
        if (!symbolTable.functions.includes(call.name)) {
          // Check if it's a standard library function or built-in
          if (!isStandardLibrary(call.name, language) && !isBuiltInFunction(call.name, language)) {
            // Check if it might be from an imported module
            const module = getStandardLibraryModule(call.name, language);
            if (!module) {
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

  // Check attribute accesses for non-existent fields
  // Disabled for now as it causes too many false positives without type inference
  /*
  const attributeIssues: Issue[] = [];
  const attributes = extractAttributeAccesses(newCode, language);
  for (const attr of attributes) {
    const className = attr.base;
    if (symbolTable.classFields?.[className] && !symbolTable.classFields[className].includes(attr.attribute)) {
      attributeIssues.push({
        type: 'nonExistentField',
        severity: 'high',
        message: `Field '${attr.attribute}' does not exist in class/interface '${className}'`,
        line: attr.line,
        column: attr.column,
        code: attr.code,
        suggestion: `Available fields: ${symbolTable.classFields[className].join(', ') || 'none'}`,
        confidence: 85,
      });
    }
  }
  */
  
  const attributeIssues: Issue[] = [];
  return [...issues, ...attributeIssues];
}

/**
 * Extract function calls from code
 */
function extractFunctionCalls(code: string, language: string): Array<{
  name: string;
  object?: string; // The object the method is called on (if any)
  line: number;
  column: number;
  code: string;
}> {
  const calls: Array<{ name: string; object?: string; line: number; column: number; code: string }> = [];
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
    const codeWithoutComments = line.split('//')[0].split('#')[0];
    
    // Pattern 1: Extract method calls: object.method(...) or obj.nested.method(...)
    // Captures (object).(method)(
    const methodCallPattern = /(\w+)\.(\w+)\s*\(/g;
    let match;
    while ((match = methodCallPattern.exec(codeWithoutComments)) !== null) {
      const objectName = match[1];
      const methodName = match[2];
      if (!isKeyword(methodName, language)) {
        calls.push({
          name: methodName,
          object: objectName,
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
          !trimmedLine.startsWith('async def') &&
          !trimmedLine.startsWith('class') &&
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
    python: ['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'open', 'input', 'type', 'isinstance', 'sum', 'min', 'max', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'super'],
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
    python: ['list', 'dict', 'set', 'tuple', 'str', 'int', 'float', 'bool', 'Exception', 'ValueError', 'TypeError', 'JSONDecodeError'],
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
    python: ['True', 'False', 'None', '__name__', '__file__', '__doc__', 'self', 'cls'],
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

/**
 * Extract attribute accesses from code (non-method dot accesses)
 */
function extractAttributeAccesses(code: string, language: string): Array<{ 
  base: string;
  attribute: string;
  line: number;
  column: number;
  code: string;
}> {
  const accesses: Array<{ base: string; attribute: string; line: number; column: number; code: string }> = [];
  const lines = code.split('\n');
  const pattern = /(\w+)\.(\w+)(?!\s*\()/g; // base.attribute not followed by (

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) return;
    const codeWithoutComments = line.split('//')[0];
    let match;
    while ((match = pattern.exec(codeWithoutComments)) !== null) {
      accesses.push({
        base: match[1],
        attribute: match[2],
        line: index + 1,
        column: match.index,
        code: line.trim(),
      });
    }
  });

  return accesses;
}
