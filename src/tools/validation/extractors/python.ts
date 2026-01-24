/**
 * Python Extractor Module - Python-specific AST Extraction
 *
 * This module extracts symbols, usages, imports, and type references from Python code
 * using Tree-sitter AST parsing. It handles Python-specific syntax including:
 * - Function and class definitions
 * - Method definitions with class context
 * - Decorators
 * - Async functions
 * - Import statements (import and from...import)
 * - Type hints and annotations
 * - Class inheritance
 *
 * @format
 */

import type Parser from "tree-sitter";
import type {
  ASTSymbol,
  ASTUsage,
  ASTImport,
  ASTTypeReference,
} from "../types.js";
import { isPythonBuiltin, isPythonBuiltinType } from "../builtins.js";

// ============================================================================
// Main Extraction Functions
// ============================================================================

/**
 * Extract all symbol definitions from Python AST.
 * Recursively traverses the AST to find function definitions, class definitions,
 * method definitions, and module-level variable assignments.
 *
 * @param node - The AST node to extract symbols from
 * @param code - The source code string
 * @param filePath - Path to the file being analyzed
 * @param symbols - Array to accumulate extracted symbols
 * @param currentClass - Name of the current class context (for methods), or null
 */
export function extractPythonSymbols(
  node: Parser.SyntaxNode,
  code: string,
  filePath: string,
  symbols: ASTSymbol[],
  currentClass: string | null,
): void {
  if (!node) return;

  switch (node.type) {
    case "function_definition": {
      const nameNode = node.childForFieldName("name");
      const paramsNode = node.childForFieldName("parameters");
      const decorators = getDecorators(node, code);

      if (nameNode) {
        const name = getText(nameNode, code);
        const params = extractPythonParams(paramsNode, code);
        const isMethod = currentClass !== null;
        const isAsync = node.children.some(
          (c) => c.type === "async" || getText(c, code) === "async",
        );

        // Detect API Routing (Semantic Bridge)
        const routingDecorators = decorators.filter(d => 
          d.includes(".route") || 
          d.includes(".get") || 
          d.includes(".post") || 
          d.includes(".put") || 
          d.includes(".delete") || 
          d.includes(".patch")
        );

        if (routingDecorators.length > 0) {
          for (const d of routingDecorators) {
             // Extract route pattern: @app.route("/api/user") -> /api/user
             const routeMatch = d.match(/["']([^"']+)["']/);
             if (routeMatch) {
               symbols.push({
                 name: routeMatch[1],
                 type: "route",
                 file: filePath,
                 line: node.startPosition.row + 1,
                 column: node.startPosition.column,
                 scope: name, // Associate with the function handling it
               });
             }
          }
        }

        symbols.push({
          name,
          type: isMethod ? "method" : "function",
          file: filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          params,
          paramCount: params.length,
          scope: currentClass || undefined,
          isAsync,
          decorators,
        });
      }
      break;
    }

    case "class_definition": {
      const nameNode = node.childForFieldName("name");
      const decorators = getDecorators(node, code);

      if (nameNode) {
        const className = getText(nameNode, code);
        symbols.push({
          name: className,
          type: "class",
          file: filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          decorators,
        });

        // Process class body with class context
        const bodyNode = node.childForFieldName("body");
        if (bodyNode) {
          for (const child of bodyNode.children) {
            extractPythonSymbols(child, code, filePath, symbols, className);
          }
        }
        return; // Don't recurse normally, we handled the body
      }
      break;
    }

    case "assignment": {
      // Top-level assignments (module variables)
      if (node.parent?.type === "module") {
        const leftNode = node.childForFieldName("left");
        if (leftNode?.type === "identifier") {
          const name = getText(leftNode, code);
          symbols.push({
            name,
            type: "variable",
            file: filePath,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
          });
        }
      }
      break;
    }
  }

  // Recurse into children
  for (const child of node.children) {
    extractPythonSymbols(child, code, filePath, symbols, currentClass);
  }
}

/**
 * Extract all symbol usages from Python AST.
 * Finds function calls, method calls, and attribute access.
 * Skips imported symbols and built-in functions to avoid false positives.
 *
 * @param node - The AST node to extract usages from
 * @param code - The source code string
 * @param usages - Array to accumulate extracted usages
 * @param externalSymbols - Set of imported symbol names to skip
 */
export function extractPythonUsages(
  node: Parser.SyntaxNode,
  code: string,
  usages: ASTUsage[],
  externalSymbols: Set<string>,
): void {
  if (!node) return;

  switch (node.type) {
    case "call": {
      const funcNode = node.childForFieldName("function");
      const argsNode = node.childForFieldName("arguments");
      const argCount = countArgs(argsNode);

      if (funcNode) {
        if (funcNode.type === "identifier") {
          // Simple function call: func()
          const name = getText(funcNode, code);
          usages.push({
            name,
            type: "call",
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            code: getLineText(code, node.startPosition.row),
            argCount,
          });
        } else if (funcNode.type === "attribute") {
          // Method call: obj.method()
          const objNode = funcNode.childForFieldName("object");
          const attrNode = funcNode.childForFieldName("attribute");

            if (objNode && attrNode) {
              const obj = getText(objNode, code);
              const method = getText(attrNode, code);

              usages.push({
                name: method,
                type: "methodCall",
                object: obj,
                line: node.startPosition.row + 1,
                column: node.startPosition.column,
                code: getLineText(code, node.startPosition.row),
                argCount,
              });
            }
        }
      }
      break;
    }

    case "identifier": {
      const name = getText(node, code);

      const parent = node.parent;
      if (!parent) break;

      // Skip if it's an attribute name (obj.NAME)
      if (parent.type === "attribute" && parent.childForFieldName("attribute") === node) break;

      // Skip if it's a function/class definition
      if ((parent.type === "function_definition" || parent.type === "class_definition") && 
          parent.childForFieldName("name") === node) break;

      // Skip if it's a parameter
      if (parent.type === "parameters" || parent.type === "typed_parameter" || parent.type === "default_parameter") break;

      // Skip if it's part of an import
      if (parent.type === "dotted_name" || parent.type === "aliased_import") break;

      // If we reach here, it's a reference
      const exists = usages.some(u => u.line === node.startPosition.row + 1 && u.column === node.startPosition.column);
      if (!exists) {
        usages.push({
          name,
          type: "reference",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          code: getLineText(code, node.startPosition.row),
        });
      }
      break;
    }
  }

  for (const child of node.children) {
    if (child) {
      extractPythonUsages(child, code, usages, externalSymbols);
    }
  }
}

/**
 * Extract all import statements from Python AST.
 * Handles both "import module" and "from module import name" statements.
 * Determines if imports are external (third-party) or internal (project files).
 *
 * @param node - The AST node to extract imports from
 * @param code - The source code string
 * @param imports - Array to accumulate extracted imports
 */
export function extractPythonImports(
  node: Parser.SyntaxNode,
  code: string,
  imports: ASTImport[],
): void {
  if (!node) return;

  switch (node.type) {
    case "import_statement": {
      // import module
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const module = getText(nameNode, code);
        imports.push({
          module,
          names: [{ imported: module, local: module }],
          isExternal: !module.startsWith("."),
          line: node.startPosition.row + 1,
        });
      }
      break;
    }

    case "import_from_statement": {
      // from module import x, y
      const moduleNode = node.childForFieldName("module_name");
      if (moduleNode) {
        const module = getText(moduleNode, code);
        const names: Array<{ imported: string; local: string }> = [];

        for (const child of node.children) {
          if (!child) continue;

          if (child.type === "dotted_name" && child !== moduleNode) {
            const name = getText(child, code);
            names.push({ imported: name, local: name });
          } else if (child.type === "aliased_import") {
            const nameNode = child.childForFieldName("name");
            const aliasNode = child.childForFieldName("alias");
            if (nameNode) {
              const imported = getText(nameNode, code);
              const local = aliasNode ? getText(aliasNode, code) : imported;
              names.push({ imported, local });
            }
          }
        }

        // Determine if import is external (third-party package) or internal (project file)
        // Internal imports in Python:
        // - Relative imports: from . import x, from .. import x
        // - Common project prefixes: app., src., tests., lib., core., api., models., services., etc.
        const internalPrefixes = [
          "app.",
          "src.",
          "tests.",
          "test.",
          "lib.",
          "core.",
          "api.",
          "models.",
          "services.",
          "utils.",
          "helpers.",
          "config.",
          "schemas.",
          "routers.",
          "routes.",
          "views.",
          "controllers.",
          "handlers.",
          "middleware.",
          "database.",
          "db.",
        ];
        const isInternal =
          module.startsWith(".") ||
          internalPrefixes.some((prefix) => module.startsWith(prefix));
        const isExternal = !isInternal;

        imports.push({
          module,
          names,
          isExternal,
          line: node.startPosition.row + 1,
        });
      }
      break;
    }
  }

  for (const child of node.children) {
    if (child) {
      extractPythonImports(child, code, imports);
    }
  }
}

/**
 * Extract type references from Python type hints.
 * Handles function parameter annotations, return types, variable annotations,
 * and class inheritance.
 *
 * @param node - The AST node to extract type references from
 * @param code - The source code string
 * @param references - Array to accumulate extracted type references
 */
export function extractPythonTypeReferences(
  node: Parser.SyntaxNode,
  code: string,
  references: ASTTypeReference[],
): void {
  if (!node) return;

  switch (node.type) {
    // Function parameter type annotation: def func(x: TypeName)
    case "typed_parameter": {
      const typeNode = node.childForFieldName("type");
      if (typeNode) {
        extractPythonTypeNamesFromNode(
          typeNode,
          code,
          references,
          "typeAnnotation",
        );
      }
      break;
    }

    // Function return type: def func() -> ReturnType
    case "function_definition": {
      const returnTypeNode = node.childForFieldName("return_type");
      if (returnTypeNode) {
        extractPythonTypeNamesFromNode(
          returnTypeNode,
          code,
          references,
          "returnType",
        );
      }
      break;
    }

    // Variable annotation: x: TypeName = value
    case "type": {
      // This is the type node in an annotated assignment
      extractPythonTypeNamesFromNode(node, code, references, "typeAnnotation");
      break;
    }

    // Class inheritance: class Foo(BaseClass)
    case "argument_list": {
      const parent = node.parent;
      if (parent?.type === "class_definition") {
        for (const child of node.children) {
          if (child && child.type === "identifier") {
            const name = getText(child, code);
            if (!isPythonBuiltinType(name)) {
              references.push({
                name,
                context: "extends",
                line: child.startPosition.row + 1,
              });
            }
          }
        }
      }
      break;
    }
  }

  // Recurse into children
  for (const child of node.children) {
    if (child) {
      extractPythonTypeReferences(child, code, references);
    }
  }
}
// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract parameter names from a Python function parameters node.
 * Filters out 'self' and 'cls' parameters which are implicit in Python methods.
 *
 * @param paramsNode - The parameters node from the function definition
 * @param code - The source code string
 * @returns Array of parameter names (excluding self/cls)
 */
export function extractPythonParams(
  paramsNode: Parser.SyntaxNode | null,
  code: string,
): string[] {
  if (!paramsNode) return [];

  const params: string[] = [];
  for (const child of paramsNode.children) {
    if (child.type === "identifier") {
      const name = getText(child, code);
      if (name !== "self" && name !== "cls") {
        params.push(name);
      }
    } else if (
      child.type === "typed_parameter" ||
      child.type === "default_parameter"
    ) {
      const nameNode = child.childForFieldName("name") || child.children[0];
      if (nameNode) {
        const name = getText(nameNode, code);
        if (name !== "self" && name !== "cls") {
          params.push(name);
        }
      }
    }
  }
  return params;
}

/**
 * Extract type names from Python type hint nodes.
 * Handles simple types, generic types, union types, and attribute access.
 * Recursively processes complex type expressions.
 *
 * @param node - The type hint node to extract names from
 * @param code - The source code string
 * @param references - Array to accumulate extracted type references
 * @param context - The context in which the type appears
 */
export function extractPythonTypeNamesFromNode(
  node: Parser.SyntaxNode,
  code: string,
  references: ASTTypeReference[],
  context: ASTTypeReference["context"],
): void {
  if (!node) return;

  switch (node.type) {
    // Simple type: TypeName
    case "identifier": {
      const name = getText(node, code);
      if (!isPythonBuiltinType(name)) {
        references.push({
          name,
          context,
          line: node.startPosition.row + 1,
        });
      }
      break;
    }

    // Generic type: List[TypeName], Dict[K, V], Optional[T]
    case "subscript": {
      const valueNode = node.childForFieldName("value");
      const subscriptNode = node.childForFieldName("subscript");

      if (valueNode) {
        const typeName = getText(valueNode, code);
        if (!isPythonBuiltinType(typeName)) {
          references.push({
            name: typeName,
            context,
            line: valueNode.startPosition.row + 1,
          });
        }
      }

      // Extract type arguments
      if (subscriptNode) {
        extractPythonTypeNamesFromNode(
          subscriptNode,
          code,
          references,
          "genericParam",
        );
      }
      break;
    }

    // Union type (Python 3.10+): TypeA | TypeB
    case "binary_operator": {
      const operator = node.children.find((c) => c && getText(c, code) === "|");
      if (operator) {
        const left = node.childForFieldName("left");
        const right = node.childForFieldName("right");
        if (left)
          extractPythonTypeNamesFromNode(left, code, references, context);
        if (right)
          extractPythonTypeNamesFromNode(right, code, references, context);
      }
      break;
    }

    // Tuple of types in subscript: Dict[str, int] -> the "str, int" part
    case "expression_list": {
      for (const child of node.children) {
        if (child && child.type !== ",") {
          extractPythonTypeNamesFromNode(child, code, references, context);
        }
      }
      break;
    }

    // Attribute access: module.TypeName
    case "attribute": {
      const name = getText(node, code);
      references.push({
        name,
        context,
        line: node.startPosition.row + 1,
      });
      break;
    }

    // None type
    case "none": {
      // Skip - it's a builtin
      break;
    }

    default: {
      // For other node types, recurse into children
      for (const child of node.children) {
        if (child) {
          extractPythonTypeNamesFromNode(child, code, references, context);
        }
      }
    }
  }
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Extract text from an AST node using pre-computed indices.
 * This is faster than using substring on each call.
 *
 * @param node - The AST node to extract text from
 * @param code - The source code string
 * @returns The text content of the node
 */
function getText(node: Parser.SyntaxNode, code: string): string {
  return code.slice(node.startIndex, node.endIndex);
}

/**
 * Get a specific line from code.
 * Uses simple split - caching would require a Map with string keys which has memory implications.
 *
 * @param code - The source code string
 * @param lineIndex - The zero-based line index
 * @returns The trimmed line text, or empty string if line doesn't exist
 */
function getLineText(code: string, lineIndex: number): string {
  const lines = code.split("\n");
  return lines[lineIndex]?.trim() || "";
}

/**
 * Count the number of arguments in a function call.
 * Excludes parentheses and commas from the count.
 *
 * @param argsNode - The arguments node from a call expression
 * @returns The number of arguments
 */
function countArgs(argsNode: Parser.SyntaxNode | null): number {
  if (!argsNode) return 0;
  let count = 0;
  for (const child of argsNode.children) {
    if (child.type !== "(" && child.type !== ")" && child.type !== ",") {
      count++;
    }
  }
  return count;
}

/**
 * Get decorators applied to a function or class definition.
 * Looks for a decorated_definition parent node and extracts all decorator children.
 *
 * @param node - The function or class definition node
 * @param code - The source code string
 * @returns Array of decorator strings (including the @ symbol)
 */
function getDecorators(node: Parser.SyntaxNode, code: string): string[] {
  const decorators: string[] = [];
  const parent = node.parent;

  if (parent?.type === "decorated_definition") {
    for (const child of parent.children) {
      if (child.type === "decorator") {
        decorators.push(getText(child, code));
      }
    }
  }

  return decorators;
}
