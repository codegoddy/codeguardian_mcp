/**
 * Symbol Table Builder
 * 
 * Parses codebase to build a comprehensive symbol table of all functions,
 * classes, variables, imports, and dependencies.
 */

import { SymbolTable } from '../types/tools.js';
import { logger } from '../utils/logger.js';

/**
 * Build symbol table from codebase
 */
export async function buildSymbolTable(
  codebase: string,
  language: string
): Promise<SymbolTable> {
  logger.debug(`Building symbol table for ${language}...`);

  const symbolTable: SymbolTable = {
    functions: [],
    classes: [],
    interfaces: [],
    variables: [],
    imports: [],
    dependencies: [],
  };

  try {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return await buildJavaScriptSymbolTable(codebase);
      case 'python':
        return await buildPythonSymbolTable(codebase);
      case 'go':
        return await buildGoSymbolTable(codebase);
      default:
        logger.warn(`Symbol table building not fully implemented for ${language}`);
        return symbolTable;
    }
  } catch (error) {
    logger.error('Error building symbol table:', error);
    return symbolTable;
  }
}

/**
 * Build symbol table for JavaScript/TypeScript
 */
async function buildJavaScriptSymbolTable(code: string): Promise<SymbolTable> {
  const symbolTable: SymbolTable = {
    functions: [],
    classes: [],
    interfaces: [],
    variables: [],
    imports: [],
    dependencies: [],
  };

  // Extract functions (various patterns)
  const functionPatterns = [
    /function\s+(\w+)\s*\(/g,                    // function name()
    /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,      // const name = () =>
    /const\s+(\w+)\s*=\s*function/g,            // const name = function
    /(\w+)\s*:\s*function\s*\(/g,               // name: function()
  ];

  for (const pattern of functionPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const funcName = match[1];
      if (funcName && !symbolTable.functions.includes(funcName)) {
        symbolTable.functions.push(funcName);
      }
    }
  }

  // Extract class methods (async method() or method())
  const classMethodPattern = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{/g;
  let match;
  while ((match = classMethodPattern.exec(code)) !== null) {
    const methodName = match[1];
    // Filter out keywords and constructors
    if (methodName && 
        methodName !== 'if' && 
        methodName !== 'for' && 
        methodName !== 'while' && 
        methodName !== 'switch' &&
        methodName !== 'catch' &&
        methodName !== 'function' &&
        !symbolTable.functions.includes(methodName)) {
      symbolTable.functions.push(methodName);
    }
  }

  // Extract classes
  const classPattern = /class\s+(\w+)/g;
  while ((match = classPattern.exec(code)) !== null) {
    symbolTable.classes.push(match[1]);
  }

  // Extract TypeScript interfaces
  const interfacePattern = /interface\s+(\w+)/g;
  while ((match = interfacePattern.exec(code)) !== null) {
    if (symbolTable.interfaces) {
      symbolTable.interfaces.push(match[1]);
    }
  }

  // Extract TypeScript type aliases
  const typeAliasPattern = /type\s+(\w+)\s*=/g;
  while ((match = typeAliasPattern.exec(code)) !== null) {
    if (symbolTable.interfaces) {
      symbolTable.interfaces.push(match[1]);
    }
  }

  // Extract imports
  const importPatterns = [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,  // import ... from '...'
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,    // require('...')
  ];

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      symbolTable.imports.push(match[1]);
    }
  }

  // Extract const/let/var declarations
  const varPattern = /(?:const|let|var)\s+(\w+)/g;
  while ((match = varPattern.exec(code)) !== null) {
    symbolTable.variables.push(match[1]);
  }

  logger.debug(`Found ${symbolTable.functions.length} functions, ${symbolTable.classes.length} classes, ${symbolTable.interfaces?.length || 0} interfaces`);

  return symbolTable;
}

/**
 * Build symbol table for Python - ENHANCED
 */
async function buildPythonSymbolTable(code: string): Promise<SymbolTable> {
  const symbolTable: SymbolTable = {
    functions: [],
    classes: [],
    variables: [],
    imports: [],
    dependencies: [],
  };

  // Extract functions (including async and decorated)
  const functionPatterns = [
    /def\s+(\w+)\s*\(/g,                        // def name()
    /async\s+def\s+(\w+)\s*\(/g,                // async def name()
  ];

  for (const pattern of functionPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const funcName = match[1];
      if (!symbolTable.functions.includes(funcName)) {
        symbolTable.functions.push(funcName);
      }
    }
  }

  // Extract class methods (indented def inside class)
  const lines = code.split('\n');
  let inClass = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if we're entering a class
    if (trimmed.startsWith('class ')) {
      inClass = true;
      continue;
    }
    
    // Check if we're exiting a class (non-indented line)
    if (inClass && line.length > 0 && line[0] !== ' ' && line[0] !== '\t') {
      inClass = false;
    }
    
    // Extract methods inside class
    if (inClass && (trimmed.startsWith('def ') || trimmed.startsWith('async def '))) {
      const methodMatch = trimmed.match(/def\s+(\w+)\s*\(/);
      if (methodMatch && !symbolTable.functions.includes(methodMatch[1])) {
        symbolTable.functions.push(methodMatch[1]);
      }
    }
  }

  // Extract classes
  const classPattern = /class\s+(\w+)/g;
  let match;
  while ((match = classPattern.exec(code)) !== null) {
    symbolTable.classes.push(match[1]);
  }

  // Extract imports (enhanced)
  const importPatterns = [
    /import\s+(\w+)/g,                          // import module
    /from\s+([\w.]+)\s+import/g,                // from module import
    /from\s+([\w.]+)\s+import\s+([\w,\s]+)/g,  // from module import name1, name2
  ];

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (!symbolTable.imports.includes(match[1])) {
        symbolTable.imports.push(match[1]);
      }
    }
  }

  // Extract variable assignments (enhanced)
  const varPattern = /^(\w+)\s*=/gm;
  while ((match = varPattern.exec(code)) !== null) {
    if (!symbolTable.variables.includes(match[1])) {
      symbolTable.variables.push(match[1]);
    }
  }

  // Extract decorated functions (Django/Flask routes)
  const decoratedFuncPattern = /@\w+.*?\n\s*def\s+(\w+)\s*\(/g;
  while ((match = decoratedFuncPattern.exec(code)) !== null) {
    if (!symbolTable.functions.includes(match[1])) {
      symbolTable.functions.push(match[1]);
    }
  }

  logger.debug(`Found ${symbolTable.functions.length} functions, ${symbolTable.classes.length} classes`);

  return symbolTable;
}

/**
 * Build symbol table for Go
 */
async function buildGoSymbolTable(code: string): Promise<SymbolTable> {
  const symbolTable: SymbolTable = {
    functions: [],
    classes: [],
    variables: [],
    imports: [],
    dependencies: [],
  };

  // Extract functions
  const functionPattern = /func\s+(\w+)\s*\(/g;
  let match;
  while ((match = functionPattern.exec(code)) !== null) {
    symbolTable.functions.push(match[1]);
  }

  // Extract structs (Go's equivalent of classes)
  const structPattern = /type\s+(\w+)\s+struct/g;
  while ((match = structPattern.exec(code)) !== null) {
    symbolTable.classes.push(match[1]);
  }

  // Extract imports
  const importPattern = /import\s+.*?["']([^"']+)["']/g;
  while ((match = importPattern.exec(code)) !== null) {
    symbolTable.imports.push(match[1]);
  }

  logger.debug(`Found ${symbolTable.functions.length} functions, ${symbolTable.classes.length} structs`);

  return symbolTable;
}
