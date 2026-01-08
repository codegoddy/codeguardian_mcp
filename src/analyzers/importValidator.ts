/** @format */

import { Issue } from "../types/tools.js";
import { logger } from "../utils/logger.js";

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
    const codeWithoutImports = removeImportStatements(
      codeWithoutComments,
      language
    );

    for (const symbol of importedSymbols) {
      // Skip React imports in JSX/TSX files - React 17+ doesn't require explicit usage
      // but many projects still import it for compatibility or tooling
      if (
        symbol.name === "React" &&
        (language === "javascript" || language === "typescript")
      ) {
        continue;
      }

      // Skip common Python imports that are often used implicitly or via attribute access
      // These are frequently false positives due to usage like os.path, sys.path, etc.
      if (language === "python") {
        const commonPythonImports = [
          "os",
          "sys",
          "typing",
          "datetime",
          "json",
          "re",
          "logging",
          "pathlib",
          "collections",
          "functools",
          "itertools",
          "contextlib",
          "pytest",
          "unittest",
          "asyncio",
          "abc",
          "enum",
          "dataclasses",
        ];
        if (commonPythonImports.includes(symbol.name)) {
          continue;
        }
      }

      // Check if symbol is used in the code (excluding import statements)
      // We use a manual word boundary check using non-word characters
      const escapedName = escapeRegex(symbol.name);

      // Pattern to match:
      // 1. Regular usage: symbol as identifier
      // 2. Type annotations: ": Symbol", "< Symbol", "Symbol[]", "Symbol>", "Symbol,"
      const usagePattern = new RegExp(
        "(?:^|[^\\w])" + escapedName + "(?:$|[^\\w])",
        "g"
      );

      const matches = codeWithoutImports.match(usagePattern) || [];

      // If no matches found in the code body, it's unused
      if (matches.length === 0) {
        issues.push({
          type: "unusedImport",
          severity: "medium",
          message: `Import '${symbol.name}' is defined but never used`,
          line: symbol.line,
          column: symbol.column,
          code: symbol.statement,
          suggestion: "Remove unused import",
          confidence: 90,
        });
      }
    }
  } catch (error) {
    logger.error("Error validating imports:", error);
  }

  return issues;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ImportedSymbol {
  name: string; // The alias or name used in code
  statement: string;
  line: number;
  column: number;
}

function extractImportedSymbols(
  code: string,
  language: string
): ImportedSymbol[] {
  const symbols: ImportedSymbol[] = [];
  const lines = code.split("\n");

  if (language === "python") {
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return;

      // from module import name1, name2 as alias
      if (trimmed.startsWith("from ")) {
        const match = trimmed.match(/from\s+[^.]+\s+import\s+(.+)/);
        if (match) {
          const imports = match[1].split(",");
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
      else if (trimmed.startsWith("import ")) {
        const match = trimmed.match(/import\s+(.+)/);
        if (match) {
          const imports = match[1].split(",");
          for (const imp of imports) {
            const parts = imp.trim().split(/\s+as\s+/);
            const name = parts.length > 1 ? parts[1].trim() : parts[0].trim();
            // Skip checking 'os.path' as a symbol, usually people use 'os'
            const rootName = name.split(".")[0];
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
  } else if (language === "javascript" || language === "typescript") {
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return;

      // import { x, y as z, type T } from '...'
      if (trimmed.match(/import\s*{/)) {
        const match = trimmed.match(/import\s*{([^}]+)}/);
        if (match) {
          const imports = match[1].split(",");
          for (const imp of imports) {
            // Handle inline type imports: "type Foo" or "type Foo as Bar"
            let cleanedImp = imp.trim().replace(/^type\s+/, "");
            const parts = cleanedImp.split(/\s+as\s+/);
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
      // import type { x } from '...' - TypeScript type imports
      else if (trimmed.match(/import\s+type\s*{/)) {
        const match = trimmed.match(/import\s+type\s*{([^}]+)}/);
        if (match) {
          const imports = match[1].split(",");
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
    });
  }

  return symbols;
}

function removeComments(code: string, language: string): string {
  if (language === "python") {
    return code.replace(/#.*/g, "");
  } else {
    // This regex handles both single-line (//) and multi-line (/* ... */) comments
    return code.replace(/\/\/.*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
}

/**
 * Remove import statements from code to avoid counting the import itself as a usage
 */
function removeImportStatements(code: string, language: string): string {
  const lines = code.split("\n");
  const filteredLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (language === "python") {
      // Skip Python import lines
      if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
        continue;
      }
    } else {
      // Skip JS/TS import lines
      if (
        trimmed.startsWith("import ") ||
        trimmed.match(/^(?:const|let|var)\s+\w+\s*=\s*require/)
      ) {
        continue;
      }
    }

    filteredLines.push(line);
  }

  return filteredLines.join("\n");
}
