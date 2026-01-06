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

  // Extract imports and imported names
  const importPatterns = [
    // import { name1, name2 } from 'module'
    { pattern: /import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g, type: 'named' },
    // import name from 'module'
    { pattern: /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, type: 'default' },
    // import * as name from 'module'
    { pattern: /import\s*\*\s*as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, type: 'namespace' },
    // require('module')
    { pattern: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, type: 'require' },
  ];

  for (const { pattern, type } of importPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (type === 'named') {
        // Extract individual named imports
        const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
        symbolTable.functions.push(...names);
        symbolTable.imports.push(match[2]);
      } else if (type === 'default' || type === 'namespace') {
        symbolTable.functions.push(match[1]);
        symbolTable.imports.push(match[2]);
      } else if (type === 'require') {
        symbolTable.imports.push(match[1]);
      }
    }
  }

  // Extract const/let/var declarations
  const varPattern = /(?:const|let|var)\s+(\w+)/g;
  while ((match = varPattern.exec(code)) !== null) {
    symbolTable.variables.push(match[1]);
  }

  logger.debug(`Found ${symbolTable.functions.length} functions, ${symbolTable.classes.length} classes, ${symbolTable.interfaces?.length || 0} interfaces`);

  symbolTable.classFields = {};
  const interfaceFieldPattern = /interface\s+(\w+)\s*{([^}]*)}/g;
  let fieldMatch;
  while ((fieldMatch = interfaceFieldPattern.exec(code)) !== null) {
    const className = fieldMatch[1];
    const body = fieldMatch[2];
    const fieldsMatch = body.match(/(\w+):/g) || [];
    symbolTable.classFields[className] = fieldsMatch.map(f => f.replace(':', '').trim());
  }

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
    // Python indentation is complex, but for this heuristic:
    // If line is not empty and starts with non-whitespace, we exited the class
    if (inClass && line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      inClass = false;
    }
    
    // Extract methods inside class
    if (inClass && (trimmed.startsWith('def ') || trimmed.startsWith('async def '))) {
      const methodMatch = trimmed.match(/def\s+(\w+)\s*\(/);
      if (methodMatch && !symbolTable.functions.includes(methodMatch[1])) {
        // We track methods as functions for now to allow loose matching
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

  // Extract imports and imported names (enhanced)
  // Process line by line for imports to avoid multiline regex issues
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('from ')) {
      const fromMatch = trimmed.match(/from\s+([\w.]+)\s+import\s+(.+)/);
      if (fromMatch) {
        const module = fromMatch[1];
        if (!symbolTable.imports.includes(module)) {
          symbolTable.imports.push(module);
        }
        
        // Handle "import (a, b, c)" syntax or simple "import a, b"
        let namesPart = fromMatch[2];
        // Remove comments
        namesPart = namesPart.split('#')[0];
        // Remove parentheses if present (simple handling)
        namesPart = namesPart.replace(/[()]/g, '');
        
        const names = namesPart.split(',').map(n => {
          const parts = n.trim().split(/\s+as\s+/);
          return parts[0].trim(); // Get original name
        }).filter(n => n);

        const aliases = namesPart.split(',').map(n => {
            const parts = n.trim().split(/\s+as\s+/);
            return parts.length > 1 ? parts[1].trim() : parts[0].trim(); // Get alias or original name
        }).filter(n => n);

        symbolTable.functions.push(...aliases.filter(n => !symbolTable.functions.includes(n)));
        
        // Also add aliases to imports list so we know they are valid modules/objects
        // Actually, let's add them to variables if they are objects, but we put them in functions
        // to pass the "function exists" check.
      }
    } else if (trimmed.startsWith('import ')) {
      const importMatch = trimmed.match(/import\s+(.+)/);
      if (importMatch) {
        let namesPart = importMatch[1];
        namesPart = namesPart.split('#')[0];
        
        const parts = namesPart.split(',');
        for (const part of parts) {
            const importDef = part.trim();
            if (importDef.includes(' as ')) {
                const [module, alias] = importDef.split(' as ').map(s => s.trim());
                if (!symbolTable.imports.includes(module)) symbolTable.imports.push(module);
                if (!symbolTable.imports.includes(alias)) symbolTable.imports.push(alias);
                // Also treat alias as a known symbol
                if (!symbolTable.variables.includes(alias)) symbolTable.variables.push(alias);
            } else {
                if (!symbolTable.imports.includes(importDef)) symbolTable.imports.push(importDef);
                if (!symbolTable.variables.includes(importDef)) symbolTable.variables.push(importDef);
            }
        }
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

  symbolTable.classFields = {};
  const fieldPattern = /class\s+(\w+):.*?(?:^|\n)\s+self\.(\w+)\s*=/gs;
  let fieldMatch;
  while ((fieldMatch = fieldPattern.exec(code)) !== null) {
    const className = fieldMatch[1];
    const field = fieldMatch[2];
    if (!symbolTable.classFields[className]) {
      symbolTable.classFields[className] = [];
    }
    symbolTable.classFields[className].push(field);
  }

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
