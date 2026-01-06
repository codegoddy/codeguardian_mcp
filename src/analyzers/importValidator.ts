import { Issue } from '../types/tools.js';
import { logger } from '../utils/logger.js';

/**
 * Validate imports in the code
 * Currently checks for:
 * 1. Unused imports (Hallucinated requirements)
 */
export async function validateImports(
  code: string,
  language: string
): Promise<Issue[]> {
  const issues: Issue[] = [];

  try {
    const importedSymbols = extractImportedSymbols(code, language);
    const codeWithoutComments = removeComments(code, language);

    for (const symbol of importedSymbols) {
      // Check if symbol is used in the code
      // We use a manual word boundary check using non-word characters
      // (?:^|\W)symbol(?:$|\W)
      // This is robust against backslash escaping issues with \b
      const usagePattern = new RegExp('(?:^|\\W)' + symbol.name + '(?:$|\\W)', 'g');
      
      const matches = codeWithoutComments.match(usagePattern) || [];
      
      // If the symbol appears only once (the definition itself), it's likely unused.
      if (matches.length <= 1) {
        issues.push({
          type: 'unusedImport',
          severity: 'medium',
          message: `Import '${symbol.name}' is defined but never used`,
          line: symbol.line,
          column: symbol.column,
          code: symbol.statement,
          suggestion: 'Remove unused import',
          confidence: 90,
        });
      }
    }

  } catch (error) {
    logger.error('Error validating imports:', error);
  }

  return issues;
}

interface ImportedSymbol {
  name: string; // The alias or name used in code
  statement: string;
  line: number;
  column: number;
}

function extractImportedSymbols(code: string, language: string): ImportedSymbol[] {
  const symbols: ImportedSymbol[] = [];
  const lines = code.split('\n');

  if (language === 'python') {
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return;

      // from module import name1, name2 as alias
      if (trimmed.startsWith('from ')) {
        const match = trimmed.match(/from\s+[^.]+\s+import\s+(.+)/);
        if (match) {
          const imports = match[1].split(',');
          for (const imp of imports) {
            const parts = imp.trim().split(/\s+as\s+/);
            const name = parts.length > 1 ? parts[1].trim() : parts[0].trim();
            symbols.push({
                name,
                statement: line.trim(),
                line: index + 1,
                column: line.indexOf(name),
            });
          }
        }
      } 
      // import module, module as alias
      else if (trimmed.startsWith('import ')) {
        const match = trimmed.match(/import\s+(.+)/);
        if (match) {
           const imports = match[1].split(',');
           for (const imp of imports) {
             const parts = imp.trim().split(/\s+as\s+/);
             const name = parts.length > 1 ? parts[1].trim() : parts[0].trim();
             // Skip checking 'os.path' as a symbol, usually people use 'os'
             const rootName = name.split('.')[0];
             symbols.push({
                name: rootName,
                statement: line.trim(),
                line: index + 1,
                column: line.indexOf(rootName),
             });
           }
        }
      }
    });
  } else if (language === 'javascript' || language === 'typescript') {
     lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

      // import { x, y as z } from '...'
      if (trimmed.match(/import\s*{/)) {
        const match = trimmed.match(/import\s*{([^}]+)}/);
        if (match) {
            const imports = match[1].split(',');
            for (const imp of imports) {
                const parts = imp.trim().split(/\s+as\s+/);
                const name = parts.length > 1 ? parts[1].trim() : parts[0].trim();
                symbols.push({
                    name,
                    statement: line.trim(),
                    line: index + 1,
                    column: line.indexOf(name),
                });
            }
        }
      }
      // import x from '...'
      else if (trimmed.match(/import\s+\w+\s+from/)) {
        const match = trimmed.match(/import\s+(\w+)\s+from/);
        if (match) {
            symbols.push({
                name: match[1],
                statement: line.trim(),
                line: index + 1,
                column: line.indexOf(match[1]),
            });
        }
      }
      // import * as x from '...'
      else if (trimmed.match(/import\s*\*\s*as\s+(\w+)/)) {
        const match = trimmed.match(/import\s*\*\s*as\s+(\w+)/);
        if (match) {
            symbols.push({
                name: match[1],
                statement: line.trim(),
                line: index + 1,
                column: line.indexOf(match[1]),
            });
        }
      }
      // const x = require('...')
      else if (trimmed.match(/(?:const|let|var)\s+(\w+)\s*=\s*require/)) {
         const match = trimmed.match(/(?:const|let|var)\s+(\w+)\s*=\s*require/);
         if (match) {
            symbols.push({
                name: match[1],
                statement: line.trim(),
                line: index + 1,
                column: line.indexOf(match[1]),
            });
         }
      }
     });
  }

  return symbols;
}

function removeComments(code: string, language: string): string {
  if (language === 'python') {
    return code.replace(/#.*/g, '');
  } else {
    return code.replace(/\/\/.*/g, '').replace(/\/[\s\S]*?\//g, '');
  }
}