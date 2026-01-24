/**
 * JavaScript/TypeScript AST Extraction Module
 *
 * This module provides functions to extract symbols, usages, imports, and type references
 * from JavaScript and TypeScript code using Tree-sitter AST parsing.
 *
 * Handles:
 * - Function declarations, arrow functions, class declarations, method definitions
 * - Function calls, method calls, instantiations (new expressions)
 * - ES6 imports, dynamic imports
 * - TypeScript type annotations, generic parameters, type references
 * - Destructuring patterns (object and array)
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
import { isJSBuiltin, isTSBuiltinType } from "../builtins.js";

// ============================================================================
// Symbol Extraction
// ============================================================================

/**
 * Extract symbol definitions from JavaScript/TypeScript AST
 * Finds: functions, classes, methods, variables, interfaces, types, enums
 */
export function extractJSSymbols(
  node: Parser.SyntaxNode,
  code: string,
  filePath: string,
  symbols: ASTSymbol[],
  currentClass: string | null,
): void {
  if (!node) return;

  switch (node.type) {
    case "function_declaration": {
      const nameNode = node.childForFieldName("name");
      const paramsNode = node.childForFieldName("parameters");

      if (nameNode) {
        const name = getText(nameNode, code);
        const params = extractJSParams(paramsNode, code);
        const isAsync = node.children.some(
          (c: Parser.SyntaxNode) => getText(c, code) === "async",
        );
        const isExported = node.parent?.type === "export_statement";

        symbols.push({
          name,
          type: "function",
          file: filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          params,
          paramCount: params.length,
          isAsync,
          isExported,
        });
      }
      break;
    }

    case "lexical_declaration":
    case "variable_declaration": {
      // const/let/var declarations
      for (const child of node.children) {
        if (child.type === "variable_declarator") {
          const nameNode = child.childForFieldName("name");
          const valueNode = child.childForFieldName("value");

          if (nameNode) {
            // Handle object destructuring: const { a, b } = something()
            if (nameNode.type === "object_pattern") {
              extractDestructuredNames(
                nameNode,
                code,
                filePath,
                symbols,
                node.startPosition.row + 1,
              );
            }
            // Handle array destructuring: const [a, b] = something()
            else if (nameNode.type === "array_pattern") {
              extractDestructuredNames(
                nameNode,
                code,
                filePath,
                symbols,
                node.startPosition.row + 1,
              );
            }
            // Handle simple identifier: const x = something
            else {
              const name = getText(nameNode, code);

              // Check if it's an arrow function
              if (
                valueNode?.type === "arrow_function" ||
                valueNode?.type === "function"
              ) {
                const paramsNode = valueNode.childForFieldName("parameters");
                const params = extractJSParams(paramsNode, code);
                const isAsync = valueNode.children.some(
                  (c: Parser.SyntaxNode) => getText(c, code) === "async",
                );

                symbols.push({
                  name,
                  type: "function",
                  file: filePath,
                  line: node.startPosition.row + 1,
                  column: node.startPosition.column,
                  params,
                  paramCount: params.length,
                  isAsync,
                });
              } else {
                symbols.push({
                  name,
                  type: "variable",
                  file: filePath,
                  line: node.startPosition.row + 1,
                  column: node.startPosition.column,
                });
              }
            }
          }
        }
      }
      break;
    }

    case "arrow_function": {
      const paramNode = node.childForFieldName("parameter");
      if (paramNode) {
        if (paramNode.type === "identifier") {
          symbols.push({
            name: getText(paramNode, code),
            type: "variable",
            file: filePath,
            line: node.startPosition.row + 1,
            column: paramNode.startPosition.column,
            isExported: false,
          });
        } else if (
          paramNode.type === "object_pattern" ||
          paramNode.type === "array_pattern"
        ) {
          extractDestructuredNames(
            paramNode,
            code,
            filePath,
            symbols,
            node.startPosition.row + 1,
          );
        }
      }
      break;
    }

    case "class_declaration": {
      const nameNode = node.childForFieldName("name");

      if (nameNode) {
        const className = getText(nameNode, code);
        const isExported = node.parent?.type === "export_statement";

        symbols.push({
          name: className,
          type: "class",
          file: filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          isExported,
        });

        // Process class body
        const bodyNode = node.childForFieldName("body");
        if (bodyNode) {
          for (const child of bodyNode.children) {
            extractJSSymbols(child, code, filePath, symbols, className);
          }
        }
        return;
      }
      break;
    }

    case "method_definition": {
      const nameNode = node.childForFieldName("name");
      const paramsNode = node.childForFieldName("parameters");

      if (nameNode) {
        const name = getText(nameNode, code);
        if (name !== "constructor") {
          const params = extractJSParams(paramsNode, code);
          const isAsync = node.children.some(
            (c: Parser.SyntaxNode) => getText(c, code) === "async",
          );

          symbols.push({
            name,
            type: "method",
            file: filePath,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            params,
            paramCount: params.length,
            scope: currentClass || undefined,
            isAsync,
          });
        }
      }
      break;
    }

    // TypeScript interface declarations
    case "interface_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const name = getText(nameNode, code);
        const isExported = node.parent?.type === "export_statement";
        symbols.push({
          name,
          type: "interface",
          file: filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          isExported,
        });
      }
      break;
    }

    // TypeScript type alias declarations
    case "type_alias_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const name = getText(nameNode, code);
        const isExported = node.parent?.type === "export_statement";
        symbols.push({
          name,
          type: "type",
          file: filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          isExported,
        });
      }
      break;
    }

    // TypeScript enum declarations
    case "enum_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const name = getText(nameNode, code);
        const isExported = node.parent?.type === "export_statement";
        symbols.push({
          name,
          type: "variable", // enums are treated as variables
          file: filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          isExported,
        });
      }
      break;
    }

    // Catch clause parameters: catch (error) { ... }
    case "catch_clause": {
      // Find the parameter node - it's usually the first identifier after 'catch'
      for (const child of node.children) {
        if (child.type === "identifier") {
          symbols.push({
            name: getText(child, code),
            type: "variable",
            file: filePath,
            line: child.startPosition.row + 1,
            column: child.startPosition.column,
            isExported: false,
          });
          break; // Only one catch parameter
        }
      }
      break;
    }

    // Named exports: export { a, b as c }
    case "export_clause": {
      for (const child of node.children) {
        if (child.type === "export_specifier") {
          const nameNode =
            child.childForFieldName("alias") || child.childForFieldName("name");
          if (nameNode) {
            const name = getText(nameNode, code);
            symbols.push({
              name,
              type: "variable",
              file: filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column,
              isExported: true,
            });
          }
        }
      }
      break;
    }

    // Function parameters (arrow functions, methods, etc.)
    case "formal_parameters":
    case "parameters": {
      for (const child of node.children) {
        if (child.type === "identifier") {
          symbols.push({
            name: getText(child, code),
            type: "variable",
            file: filePath,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            isExported: false,
          });
        } else if (
          child.type === "object_pattern" ||
          child.type === "array_pattern"
        ) {
          extractDestructuredNames(
            child,
            code,
            filePath,
            symbols,
            node.startPosition.row + 1,
          );
        } else if (
          child.type === "required_parameter" ||
          child.type === "optional_parameter" ||
          child.type === "rest_pattern"
        ) {
          const pattern =
            child.childForFieldName("pattern") ||
            child.children.find(
              (c) =>
                c.type === "identifier" ||
                c.type === "object_pattern" ||
                c.type === "array_pattern",
            );
          if (pattern) {
            if (pattern.type === "identifier") {
              symbols.push({
                name: getText(pattern, code),
                type: "variable",
                file: filePath,
                line: node.startPosition.row + 1,
                column: pattern.startPosition.column,
                isExported: false,
              });
            } else {
              extractDestructuredNames(
                pattern,
                code,
                filePath,
                symbols,
                node.startPosition.row + 1,
              );
            }
          }
        }
      }
      break;
    }
  }

  for (const child of node.children) {
    extractJSSymbols(child, code, filePath, symbols, currentClass);
  }
}

// ============================================================================
// Parameter Extraction
// ============================================================================

/**
 * Extract parameter names from function/method parameter list
 */
export function extractJSParams(
  paramsNode: Parser.SyntaxNode | null,
  code: string,
): string[] {
  if (!paramsNode) return [];

  const params: string[] = [];
  for (const child of paramsNode.children) {
    if (child.type === "identifier") {
      params.push(getText(child, code));
    } else if (
      child.type === "required_parameter" ||
      child.type === "optional_parameter"
    ) {
      const nameNode = child.childForFieldName("pattern") || child.children[0];
      if (nameNode) {
        params.push(getText(nameNode, code));
      }
    }
  }
  return params;
}

/**
 * Extract variable names from destructuring patterns
 * Handles: const { a, b } = x and const [a, b] = x
 */
export function extractDestructuredNames(
  node: Parser.SyntaxNode,
  code: string,
  filePath: string,
  symbols: ASTSymbol[],
  line: number,
): void {
  if (!node) return;

  switch (node.type) {
    case "identifier":
    case "shorthand_property_identifier_pattern": {
      const name = getText(node, code);
      symbols.push({
        name,
        type: "variable",
        file: filePath,
        line,
        column: node.startPosition.column,
      });
      break;
    }

    case "pair_pattern": {
      const valueNode = node.childForFieldName("value");
      if (valueNode) {
        extractDestructuredNames(valueNode, code, filePath, symbols, line);
      }
      break;
    }

    case "assignment_pattern": {
      const leftNode = node.childForFieldName("left");
      if (leftNode) {
        extractDestructuredNames(leftNode, code, filePath, symbols, line);
      }
      break;
    }

    case "object_pattern":
    case "array_pattern": {
      for (const child of node.children) {
        // Only recurse into relevant pattern parts
        if (
          child.type === "pair_pattern" ||
          child.type === "shorthand_property_identifier_pattern" ||
          child.type === "object_pattern" ||
          child.type === "array_pattern" ||
          child.type === "assignment_pattern" ||
          child.type === "identifier"
        ) {
          extractDestructuredNames(child, code, filePath, symbols, line);
        }
      }
      break;
    }
  }
}

// ============================================================================
// Usage Extraction
// ============================================================================

/**
 * Extract symbol usages from JavaScript/TypeScript AST
 * Finds: function calls, method calls, instantiations (new expressions)
 */
export function extractJSUsages(
  node: Parser.SyntaxNode,
  code: string,
  usages: ASTUsage[],
  externalSymbols: Set<string>,
): void {
  if (!node) return;

  switch (node.type) {
    case "call_expression": {
      const funcNode = node.childForFieldName("function");
      const argsNode = node.childForFieldName("arguments");
      const argCount = countArgs(argsNode);

      if (funcNode) {
        if (funcNode.type === "identifier") {
          const name = getText(funcNode, code);
          // Don't skip imported symbols or built-ins here; we need to track them
          // for unused import detection and proper validation.
          usages.push({
            name,
            type: "call",
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            code: getLineText(code, node.startPosition.row),
            argCount,
          });
        } else if (funcNode.type === "member_expression") {
          const objNode = funcNode.childForFieldName("object");
          const propNode = funcNode.childForFieldName("property");

          if (objNode && propNode) {
            const obj = getText(objNode, code);
            const method = getText(propNode, code);

            if (!externalSymbols.has(obj) && !isJSBuiltin(obj)) {
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

    case "new_expression": {
      const constructorNode = node.childForFieldName("constructor");
      if (constructorNode?.type === "identifier") {
        const name = getText(constructorNode, code);
        usages.push({
          name,
          type: "instantiation",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          code: getLineText(code, node.startPosition.row),
        });
      }
      break;
    }

    case "identifier":
    case "jsx_identifier": {
      const name = getText(node, code);

      // Semantic Bridge: Detect potential API calls (fetch('/api/...'))
      if (
        name === "fetch" ||
        name === "axios" ||
        name === "get" ||
        name === "post"
      ) {
        const parentCall =
          node.parent?.type === "call_expression" ? node.parent
          : node.parent?.parent?.type === "call_expression" ? node.parent.parent
          : null;
        if (parentCall) {
          const argsNode = parentCall.childForFieldName("arguments");
          if (argsNode && argsNode.children.length > 0) {
            const firstArg = argsNode.children.find(
              (c) => c.type === "string" || c.type === "template_string",
            );
            if (firstArg) {
              const url = getText(firstArg, code).replace(/['"`]/g, "");
              if (url.startsWith("/")) {
                const exists = usages.some(
                  (u) =>
                    u.name === url && u.line === node.startPosition.row + 1,
                );
                if (!exists) {
                  usages.push({
                    name: url,
                    type: "reference", // We tag it as reference with name = URL
                    line: node.startPosition.row + 1,
                    column: node.startPosition.column,
                    code: `API_CALL: ${url}`,
                  });
                }
              }
            }
          }
        }
      }

      // Only skip standard lowercase JSX tags (div, span, etc.)
      if (node.type === "jsx_identifier" && /^[a-z]/.test(name)) break;

      // Filter out non-usage positions:
      const parent = node.parent;
      if (!parent) break;

      // 0. Skip if inside a string literal or JSX text content
      // This prevents false positives like "Notes" in <h3>Comments & Notes</h3>
      let ancestor: Parser.SyntaxNode | null = parent;
      while (ancestor) {
        if (
          ancestor.type === "string" ||
          ancestor.type === "template_string" ||
          ancestor.type === "jsx_text" ||
          ancestor.type === "string_fragment"
        ) {
          return; // Don't process this identifier at all
        }
        ancestor = ancestor.parent;
      }

      // 1. Skip if it's the property in a member expression (x.NAME or <Comp.NAME />)
      // EXCEPT: If the object is 'state' or 'store', we might want to check it for store hallucinations.
      if (
        (parent.type === "member_expression" ||
          parent.type === "jsx_member_expression") &&
        parent.childForFieldName("property") === node
      ) {
        // Detect store property access: state.hallucination
        const objNode = parent.childForFieldName("object");
        if (objNode && getText(objNode, code) === "state") {
          // We ALLOW this to be processed as a usage to catch hallucinations in stores
        } else {
          break;
        }
      }

      // 2. Skip if it's a field name in an object literal ({ NAME: val })
      if (parent.type === "pair" && parent.childForFieldName("key") === node)
        break;

      // 3. Skip if it's a function/class/variable declaration name
      if (
        (parent.type === "function_declaration" ||
          parent.type === "class_declaration" ||
          parent.type === "variable_declarator" ||
          parent.type === "method_definition" ||
          parent.type === "interface_declaration" ||
          parent.type === "type_alias_declaration") &&
        parent.childForFieldName("name") === node
      )
        break;

      // 4. Skip if it's a formal parameter
      if (
        parent.type === "formal_parameters" ||
        parent.type === "required_parameter" ||
        parent.type === "optional_parameter"
      )
        break;

      // 5. Skip if it's the property in shorthand ({ name }) - this IS a usage of the outer 'name'
      // but Tree-sitter treats it as a 'shorthand_property_identifier'.
      if (parent.type === "shorthand_property_identifier") {
        // This IS a usage.
      }

      // 6. Skip if it's part of an import/export statement (handled separately)
      if (
        parent.type === "import_specifier" ||
        parent.type === "export_specifier"
      )
        break;

      // 8. Skip if it's a JSX attribute name
      if (
        parent.type === "jsx_attribute" &&
        parent.childForFieldName("name") === node
      )
        break;

      // 7. If we reach here, it's likely a reference (usage as a value)
      // Check if it was already added as a call or instantiation in the same line/col
      const exists = usages.some(
        (u) =>
          u.line === node.startPosition.row + 1 &&
          u.column === node.startPosition.column,
      );
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
      extractJSUsages(child, code, usages, externalSymbols);
    }
  }
}

// ============================================================================
// Import Extraction
// ============================================================================

/**
 * Extract import statements from JavaScript/TypeScript AST
 * Handles: ES6 imports, dynamic imports (await import(...))
 */
export function extractJSImports(
  node: Parser.SyntaxNode,
  code: string,
  imports: ASTImport[],
): void {
  if (!node) return;

  if (node.type === "import_statement") {
    const sourceNode = node.childForFieldName("source");
    if (sourceNode) {
      const module = getText(sourceNode, code).replace(/['"]/g, "");
      const names: Array<{ imported: string; local: string }> = [];

      for (const child of node.children) {
        if (!child) continue;

        if (child.type === "import_clause") {
          for (const clauseChild of child.children) {
            if (!clauseChild) continue;

            if (clauseChild.type === "identifier") {
              // Default import
              const name = getText(clauseChild, code);
              names.push({ imported: "default", local: name });
            } else if (clauseChild.type === "named_imports") {
              for (const specifier of clauseChild.children) {
                if (!specifier) continue;

                if (specifier.type === "import_specifier") {
                  const nameNode = specifier.childForFieldName("name");
                  const aliasNode = specifier.childForFieldName("alias");
                  if (nameNode) {
                    const imported = getText(nameNode, code);
                    const local =
                      aliasNode ? getText(aliasNode, code) : imported;
                    names.push({ imported, local });
                  }
                }
              }
            } else if (clauseChild.type === "namespace_import") {
              const nameNode = clauseChild.children.find(
                (c: Parser.SyntaxNode) => c && c.type === "identifier",
              );
              if (nameNode) {
                const name = getText(nameNode, code);
                names.push({ imported: "*", local: name });
              }
            }
          }
        }
      }

      const isExternal =
        !module.startsWith(".") &&
        !module.startsWith("@/") &&
        !module.startsWith("~/");

      imports.push({
        module,
        names,
        isExternal,
        line: node.startPosition.row + 1,
      });
    }
  }

  // Handle dynamic imports: await import('...')
  // These appear as call_expression with "import" as the function
  if (node.type === "call_expression") {
    const funcNode = node.childForFieldName("function");
    if (funcNode && getText(funcNode, code) === "import") {
      const argsNode = node.childForFieldName("arguments");
      if (argsNode) {
        // Find the string argument
        for (const arg of argsNode.children) {
          if (
            arg &&
            (arg.type === "string" || arg.type === "template_string")
          ) {
            const module = getText(arg, code).replace(/['"`]/g, "");
            if (module) {
              // For dynamic imports, we mark all possible named imports
              // by looking at the destructuring pattern if available
              const names: Array<{ imported: string; local: string }> = [];

              // Check if this is part of a destructuring assignment
              // e.g., const { foo, bar } = await import('...')
              const parent = node.parent;
              if (parent?.type === "await_expression") {
                const grandparent = parent.parent;
                if (grandparent?.type === "variable_declarator") {
                  const nameNode = grandparent.childForFieldName("name");
                  if (nameNode?.type === "object_pattern") {
                    // Extract destructured names
                    for (const prop of nameNode.children) {
                      if (
                        prop?.type === "shorthand_property_identifier_pattern"
                      ) {
                        const name = getText(prop, code);
                        names.push({ imported: name, local: name });
                      } else if (prop?.type === "pair_pattern") {
                        const keyNode = prop.childForFieldName("key");
                        const valueNode = prop.childForFieldName("value");
                        if (keyNode && valueNode) {
                          names.push({
                            imported: getText(keyNode, code),
                            local: getText(valueNode, code),
                          });
                        }
                      }
                    }
                  }
                }
              }

              // If no destructuring found, mark as wildcard import
              if (names.length === 0) {
                names.push({ imported: "*", local: "*" });
              }

              const isExternal =
                !module.startsWith(".") &&
                !module.startsWith("@/") &&
                !module.startsWith("~/");

              imports.push({
                module,
                names,
                isExternal,
                line: node.startPosition.row + 1,
              });
            }
          }
        }
      }
    }
  }

  for (const child of node.children) {
    if (child) {
      extractJSImports(child, code, imports);
    }
  }
}

// ============================================================================
// Type Reference Extraction
// ============================================================================

/**
 * Extract type references from JavaScript/TypeScript AST
 * Finds where types/interfaces are USED (not defined), including:
 * - Type annotations: `param: TypeName`
 * - Generic parameters: `Array<TypeName>`, `base.extend<TypeName>`
 * - Return types: `): TypeName`
 * - Extends/implements: `extends TypeName`, `implements TypeName`
 * - Property types in interfaces/types
 */
export function extractJSTypeReferences(
  node: Parser.SyntaxNode,
  code: string,
  references: ASTTypeReference[],
): void {
  if (!node) return;

  switch (node.type) {
    // Type annotations: `param: TypeName` or `const x: TypeName`
    case "type_annotation": {
      extractTypeNamesFromNode(node, code, references, "typeAnnotation");
      break;
    }

    // Generic type arguments: `Array<TypeName>`, `Promise<TypeName>`, `base.extend<TypeName>`
    case "type_arguments": {
      extractTypeNamesFromNode(node, code, references, "genericParam");
      break;
    }

    // Return type: `function(): TypeName`
    case "return_type": {
      extractTypeNamesFromNode(node, code, references, "returnType");
      break;
    }

    // Extends clause: `class X extends Y` or `interface X extends Y`
    case "extends_clause":
    case "extends_type_clause": {
      extractTypeNamesFromNode(node, code, references, "extends");
      break;
    }

    // Implements clause: `class X implements Y`
    case "implements_clause": {
      extractTypeNamesFromNode(node, code, references, "implements");
      break;
    }

    // Property signature in interface: `prop: TypeName`
    case "property_signature": {
      const typeNode = node.childForFieldName("type");
      if (typeNode) {
        extractTypeNamesFromNode(typeNode, code, references, "propertyType");
      }
      break;
    }

    // Index signature: `[key: string]: TypeName`
    case "index_signature": {
      const typeNode = node.childForFieldName("type");
      if (typeNode) {
        extractTypeNamesFromNode(typeNode, code, references, "propertyType");
      }
      break;
    }

    // Method signature return type
    case "method_signature": {
      const returnTypeNode = node.childForFieldName("return_type");
      if (returnTypeNode) {
        extractTypeNamesFromNode(
          returnTypeNode,
          code,
          references,
          "returnType",
        );
      }
      // Also check parameters
      const paramsNode = node.childForFieldName("parameters");
      if (paramsNode) {
        extractJSTypeReferences(paramsNode, code, references);
      }
      break;
    }

    // Required/optional parameters with type annotations
    case "required_parameter":
    case "optional_parameter": {
      const typeNode = node.childForFieldName("type");
      if (typeNode) {
        extractTypeNamesFromNode(typeNode, code, references, "typeAnnotation");
      }
      break;
    }
  }

  // Recurse into children
  for (const child of node.children) {
    if (child) {
      extractJSTypeReferences(child, code, references);
    }
  }
}

/**
 * Extract type names from a type node (handles nested types, unions, etc.)
 */
export function extractTypeNamesFromNode(
  node: Parser.SyntaxNode,
  code: string,
  references: ASTTypeReference[],
  context: ASTTypeReference["context"],
): void {
  if (!node) return;

  switch (node.type) {
    // Simple type reference: `TypeName`
    case "type_identifier": {
      const name = getText(node, code);
      // Skip built-in types
      if (!isTSBuiltinType(name)) {
        references.push({
          name,
          context,
          line: node.startPosition.row + 1,
        });
      }
      break;
    }

    // Generic type: `Array<T>`, `Promise<T>`, `Map<K, V>`
    case "generic_type": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const name = getText(nameNode, code);
        if (!isTSBuiltinType(name)) {
          references.push({
            name,
            context,
            line: node.startPosition.row + 1,
          });
        }
      }
      // Also extract type arguments
      const argsNode = node.childForFieldName("type_arguments");
      if (argsNode) {
        extractTypeNamesFromNode(argsNode, code, references, "genericParam");
      }
      break;
    }

    // Nested member expression type: `Namespace.TypeName`
    case "nested_type_identifier": {
      // Get the full qualified name
      const name = getText(node, code);
      references.push({
        name,
        context,
        line: node.startPosition.row + 1,
      });
      break;
    }

    // Union type: `TypeA | TypeB`
    case "union_type": {
      for (const child of node.children) {
        if (child && child.type !== "|") {
          extractTypeNamesFromNode(child, code, references, context);
        }
      }
      break;
    }

    // Intersection type: `TypeA & TypeB`
    case "intersection_type": {
      for (const child of node.children) {
        if (child && child.type !== "&") {
          extractTypeNamesFromNode(child, code, references, context);
        }
      }
      break;
    }

    // Array type: `TypeName[]`
    case "array_type": {
      const elementType = node.children[0];
      if (elementType) {
        extractTypeNamesFromNode(elementType, code, references, context);
      }
      break;
    }

    // Parenthesized type: `(TypeName)`
    case "parenthesized_type": {
      for (const child of node.children) {
        if (child && child.type !== "(" && child.type !== ")") {
          extractTypeNamesFromNode(child, code, references, context);
        }
      }
      break;
    }

    // Type arguments: `<TypeA, TypeB>`
    case "type_arguments": {
      for (const child of node.children) {
        if (
          child &&
          child.type !== "<" &&
          child.type !== ">" &&
          child.type !== ","
        ) {
          extractTypeNamesFromNode(child, code, references, "genericParam");
        }
      }
      break;
    }

    // Conditional type: `T extends U ? X : Y`
    case "conditional_type": {
      for (const child of node.children) {
        if (child) {
          extractTypeNamesFromNode(child, code, references, context);
        }
      }
      break;
    }

    // Indexed access type: `T[K]`
    case "indexed_access_type": {
      const objectType = node.childForFieldName("object_type");
      const indexType = node.childForFieldName("index_type");
      if (objectType) {
        extractTypeNamesFromNode(objectType, code, references, context);
      }
      if (indexType) {
        extractTypeNamesFromNode(indexType, code, references, context);
      }
      break;
    }

    // Mapped type: `{ [K in keyof T]: V }`
    case "mapped_type_clause": {
      for (const child of node.children) {
        if (child) {
          extractTypeNamesFromNode(child, code, references, context);
        }
      }
      break;
    }

    // Object type / type literal: `{ prop: Type }`
    case "object_type": {
      for (const child of node.children) {
        if (child) {
          extractJSTypeReferences(child, code, references);
        }
      }
      break;
    }

    // Function type: `(param: Type) => ReturnType`
    case "function_type": {
      const paramsNode = node.childForFieldName("parameters");
      const returnNode = node.childForFieldName("return_type");
      if (paramsNode) {
        for (const child of paramsNode.children) {
          if (child) {
            extractJSTypeReferences(child, code, references);
          }
        }
      }
      if (returnNode) {
        extractTypeNamesFromNode(returnNode, code, references, "returnType");
      }
      break;
    }

    // Typeof type: `typeof SomeValue`
    case "typeof_type": {
      // Skip - this references a value, not a type
      break;
    }

    // Keyof type: `keyof T`
    case "keyof_type": {
      const typeArg = node.children.find(
        (c: Parser.SyntaxNode) => c && c.type !== "keyof",
      );
      if (typeArg) {
        extractTypeNamesFromNode(typeArg, code, references, context);
      }
      break;
    }

    default: {
      // For other node types, recurse into children
      for (const child of node.children) {
        if (child) {
          extractTypeNamesFromNode(child, code, references, context);
        }
      }
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract text from an AST node using pre-computed indices (faster than substring on each call)
 */
function getText(node: Parser.SyntaxNode, code: string): string {
  return code.slice(node.startIndex, node.endIndex);
}

/**
 * Get a specific line from code
 * Uses simple split - caching would require a Map with string keys which has memory implications
 */
function getLineText(code: string, lineIndex: number): string {
  const lines = code.split("\n");
  return lines[lineIndex]?.trim() || "";
}

/**
 * Count arguments in a function call
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
