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

// Common project-internal import prefixes for Python
const INTERNAL_PREFIXES = [
  "app.", "src.", "tests.", "test.", "lib.", "core.", "api.",
  "models.", "services.", "utils.", "helpers.", "config.",
  "schemas.", "routers.", "routes.", "views.", "controllers.",
  "handlers.", "middleware.", "database.", "db.",
];

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
      // In tree-sitter-python, module-level assignments are:
      //   module > expression_statement > assignment
      const isModuleLevel =
        node.parent?.type === "module" ||
        (node.parent?.type === "expression_statement" &&
          node.parent?.parent?.type === "module");
      // Class-level assignments (class attributes)
      const isClassLevel =
        !isModuleLevel &&
        currentClass !== null &&
        (node.parent?.type === "expression_statement" &&
          node.parent?.parent?.type === "block" &&
          node.parent?.parent?.parent?.type === "class_definition");
      if (isModuleLevel || isClassLevel) {
        const leftNode = node.childForFieldName("left");
        if (leftNode?.type === "identifier") {
          const name = getText(leftNode, code);
          symbols.push({
            name,
            type: "variable",
            file: filePath,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            isExported: isModuleLevel,
            scope: isClassLevel ? currentClass || undefined : undefined,
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
 * Collect all locally-defined identifier names in a Python AST.
 * This pre-pass collects assignment targets, function parameters, for-loop variables,
 * with-as targets, except-as targets, comprehension variables, and function/class names.
 * Used to prevent false positives when these names appear as references later in the code.
 *
 * @param node - The root AST node to walk
 * @param code - The source code string
 * @param definitions - Set to accumulate locally-defined names
 */
export function collectPythonLocalDefinitions(
  node: Parser.SyntaxNode,
  code: string,
  definitions: Set<string>,
): void {
  if (!node) return;

  switch (node.type) {
    // Local imports: `import concurrent.futures` inside a function defines `concurrent`
    case "import_statement": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const module = getText(nameNode, code);
        // `import concurrent.futures` makes `concurrent` available
        const baseName = module.split(".")[0];
        definitions.add(baseName);
      }
      break;
    }
    // Local from-imports: `from X import Y` inside a function defines `Y`
    case "import_from_statement": {
      for (const child of node.children) {
        if (!child) continue;
        if (child.type === "dotted_name" && child !== node.childForFieldName("module_name")) {
          definitions.add(getText(child, code));
        } else if (child.type === "aliased_import") {
          const aliasNode = child.childForFieldName("alias");
          const nameNode = child.childForFieldName("name");
          if (aliasNode) {
            definitions.add(getText(aliasNode, code));
          } else if (nameNode) {
            definitions.add(getText(nameNode, code));
          }
        }
      }
      break;
    }
    case "identifier": {
      const name = getText(node, code);
      const parent = node.parent;
      if (!parent) break;

      // Assignment target: x = ...
      if (parent.type === "assignment" && parent.childForFieldName("left")?.id === node.id) {
        definitions.add(name);
      }
      // Augmented assignment: x += ...
      if (parent.type === "augmented_assignment" && parent.childForFieldName("left")?.id === node.id) {
        definitions.add(name);
      }
      // Function/class definition name
      if ((parent.type === "function_definition" || parent.type === "class_definition") &&
          parent.childForFieldName("name")?.id === node.id) {
        definitions.add(name);
      }
      // Function parameters (all types)
      if (parent.type === "parameters" || parent.type === "typed_parameter" ||
          parent.type === "default_parameter" || parent.type === "typed_default_parameter" ||
          parent.type === "list_splat_pattern" || parent.type === "dictionary_splat_pattern") {
        definitions.add(name);
      }
      // Lambda parameters
      if (parent.type === "lambda_parameters") {
        definitions.add(name);
      }
      // For-loop variable: for x in ...
      if (parent.type === "for_statement" && parent.childForFieldName("left")?.id === node.id) {
        definitions.add(name);
      }
      // Tuple/pattern unpacking targets
      if (parent.type === "pattern_list" || parent.type === "tuple_pattern") {
        definitions.add(name);
      }
      // With-as / except-as target
      if (parent.type === "as_pattern_target") {
        definitions.add(name);
      }
      // Comprehension variable
      if (parent.type === "for_in_clause" && parent.childForFieldName("left")?.id === node.id) {
        definitions.add(name);
      }
      // Walrus operator target
      if (parent.type === "named_expression" && parent.childForFieldName("name")?.id === node.id) {
        definitions.add(name);
      }
      // Global/nonlocal declarations
      if (parent.type === "global_statement" || parent.type === "nonlocal_statement") {
        definitions.add(name);
      }
      // Unpacking target in assignment
      if (isUnpackingTarget(node)) {
        definitions.add(name);
      }
      break;
    }
  }

  for (const child of node.children) {
    if (child) {
      collectPythonLocalDefinitions(child, code, definitions);
    }
  }
}

/**
 * Extract all symbol usages from Python AST.
 * Finds function calls, method calls, and attribute access.
 * Skips imported symbols, built-in functions, and locally-defined variables to avoid false positives.
 *
 * @param node - The AST node to extract usages from
 * @param code - The source code string
 * @param usages - Array to accumulate extracted usages
 * @param externalSymbols - Set of imported symbol names to skip
 * @param localDefinitions - Set of locally-defined names to skip (from collectPythonLocalDefinitions)
 */
export function extractPythonUsages(
  node: Parser.SyntaxNode,
  code: string,
  usages: ASTUsage[],
  externalSymbols: Set<string>,
  localDefinitions?: Set<string>,
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

              // Only track method calls with simple object references (identifier, attribute, subscript)
              // Skip complex expressions like (end - start).total_seconds() where the "object"
              // is a binary expression — these produce meaningless object names for validation
              const simpleObjTypes = new Set([
                "identifier", "attribute", "subscript", "call",
                "parenthesized_expression",
              ]);
              const isSimpleObj = simpleObjTypes.has(objNode.type) && 
                (objNode.type !== "parenthesized_expression" || 
                 objNode.namedChildren[0]?.type === "identifier");

              if (isSimpleObj) {
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
      }
      break;
    }

    case "identifier": {
      const name = getText(node, code);

      const parent = node.parent;
      if (!parent) break;

      // Skip if it's an attribute name (obj.NAME) — handled by methodCall extraction
      if (parent.type === "attribute" && parent.childForFieldName("attribute")?.id === node.id) break;

      // Skip if it's a function/class definition name
      if ((parent.type === "function_definition" || parent.type === "class_definition") && 
          parent.childForFieldName("name")?.id === node.id) break;

      // Skip if it's a parameter definition (function params, lambda params)
      if (parent.type === "parameters" || parent.type === "typed_parameter" || parent.type === "default_parameter" ||
          parent.type === "typed_default_parameter" || parent.type === "list_splat_pattern" || parent.type === "dictionary_splat_pattern" ||
          parent.type === "lambda_parameters") break;

      // Skip if it's part of an import statement
      if (parent.type === "dotted_name" || parent.type === "aliased_import" ||
          parent.type === "import_statement" || parent.type === "import_from_statement") break;

      // Skip assignment targets (left side of =) — these are definitions, not usages
      if (parent.type === "assignment" && parent.childForFieldName("left")?.id === node.id) break;
      if (parent.type === "augmented_assignment" && parent.childForFieldName("left")?.id === node.id) break;

      // Skip if it's the target in a for loop (for x in items)
      if (parent.type === "for_statement" && parent.childForFieldName("left")?.id === node.id) break;
      // Also handle tuple unpacking in for loops: for k, v in items
      if (parent.type === "pattern_list" || parent.type === "tuple_pattern") break;

      // Skip if it's the variable in a with statement (with open() as f)
      // or except clause (except Exception as e)
      // Tree-sitter wraps the alias identifier in an as_pattern_target node
      if (parent.type === "as_pattern_target") break;
      if (parent.type === "as_pattern" && parent.childForFieldName("alias")?.id === node.id) break;
      if (parent.type === "except_clause") break;

      // Skip keyword argument names (func(key=value) — skip "key")
      if (parent.type === "keyword_argument" && parent.childForFieldName("name")?.id === node.id) break;

      // Skip comprehension variables (x for x in items)
      if (parent.type === "for_in_clause" && parent.childForFieldName("left")?.id === node.id) break;

      // Decorators: @contextmanager, @app.route("/"), etc.
      // These ARE usages of the imported symbol, so we don't skip them.
      // For simple decorators like @contextmanager, the identifier is direct child of decorator
      // For complex ones like @app.route, the identifier is inside an attribute/call

      // Skip if it's the left side of an annotated assignment (x: int = 5)
      if (parent.type === "type" && parent.parent?.type === "assignment") break;

      // Skip walrus operator target (:= )
      if (parent.type === "named_expression" && parent.childForFieldName("name")?.id === node.id) break;

      // Skip global/nonlocal declarations
      if (parent.type === "global_statement" || parent.type === "nonlocal_statement") break;

      // Skip if it's a tuple/list unpacking target in assignment
      if (isUnpackingTarget(node)) break;

      // Skip locally-defined variables (function params, assignment targets, loop vars, etc.)
      // These are local scope — CodeGuardian only validates project-level symbols
      if (localDefinitions?.has(name)) break;

      // If we reach here, it's a genuine reference usage
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
      extractPythonUsages(child, code, usages, externalSymbols, localDefinitions);
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
      // import module  OR  import module as alias
      for (const child of node.children) {
        if (!child) continue;
        if (child.type === "dotted_name") {
          // Simple: import json, import app.models
          const module = getText(child, code);
          const isInternal = module.startsWith(".") ||
            INTERNAL_PREFIXES.some((prefix) => module.startsWith(prefix) || module === prefix.slice(0, -1));
          imports.push({
            module,
            names: [{ imported: module, local: module }],
            isExternal: !isInternal,
            line: node.startPosition.row + 1,
          });
        } else if (child.type === "aliased_import") {
          // Aliased: import sqlalchemy as sa
          const nameNode = child.childForFieldName("name");
          const aliasNode = child.childForFieldName("alias");
          if (nameNode) {
            const module = getText(nameNode, code);
            const local = aliasNode ? getText(aliasNode, code) : module;
            const isInternal = module.startsWith(".") ||
              INTERNAL_PREFIXES.some((prefix) => module.startsWith(prefix) || module === prefix.slice(0, -1));
            imports.push({
              module,
              names: [{ imported: module, local }],
              isExternal: !isInternal,
              line: node.startPosition.row + 1,
            });
          }
        }
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
        const isInternal =
          module.startsWith(".") ||
          INTERNAL_PREFIXES.some((prefix) => module.startsWith(prefix) || module === prefix.slice(0, -1));
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
 * Check if an identifier node is an unpacking target in an assignment.
 * Handles: a, b = func()  /  [x, y] = items  /  (a, b) = items
 * Also handles nested unpacking in for loops: for (a, b) in items
 *
 * @param node - The identifier node to check
 * @returns true if the identifier is an unpacking target (definition, not usage)
 */
function isUnpackingTarget(node: Parser.SyntaxNode): boolean {
  let current = node.parent;
  while (current) {
    // If we hit a tuple/list that is the left side of an assignment, it's an unpacking target
    if (current.type === "pattern_list" || current.type === "tuple_pattern" || current.type === "list_pattern") {
      const grandparent = current.parent;
      if (grandparent) {
        if (grandparent.type === "assignment" && grandparent.childForFieldName("left")?.id === current.id) return true;
        if (grandparent.type === "for_statement" && grandparent.childForFieldName("left")?.id === current.id) return true;
        if (grandparent.type === "for_in_clause" && grandparent.childForFieldName("left")?.id === current.id) return true;
      }
    }
    // Also check expression_list (Python uses this for tuple unpacking without parens)
    if (current.type === "expression_list") {
      const grandparent = current.parent;
      if (grandparent) {
        if (grandparent.type === "assignment" && grandparent.childForFieldName("left")?.id === current.id) return true;
        if (grandparent.type === "for_statement" && grandparent.childForFieldName("left")?.id === current.id) return true;
        if (grandparent.type === "for_in_clause" && grandparent.childForFieldName("left")?.id === current.id) return true;
      }
    }
    // Don't traverse too far up
    if (current.type === "assignment" || current.type === "for_statement" || current.type === "for_in_clause" ||
        current.type === "function_definition" || current.type === "class_definition" || current.type === "module") {
      break;
    }
    current = current.parent;
  }
  return false;
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
