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
  options: { includeParameterSymbols?: boolean } = {},
): void {
  if (!node) return;

  switch (node.type) {
    case "function_declaration":
    case "function_expression": {
      const nameNode = node.childForFieldName("name");
      const paramsNode = node.childForFieldName("parameters");

      if (nameNode) {
        const name = getText(nameNode, code);
        const params = extractJSParams(paramsNode, code, filePath, symbols, options);
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
      // Check if this declaration is exported
      const isExported = node.parent?.type === "export_statement";
      
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
                const paramsNode = valueNode.childForFieldName("parameters") || valueNode.childForFieldName("parameter");
                const params = extractJSParams(
                  paramsNode,
                  code,
                  filePath,
                  symbols,
                  options,
                );
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
                  isExported,
                });
              } else {
                symbols.push({
                  name,
                  type: "variable",
                  file: filePath,
                  line: node.startPosition.row + 1,
                  column: node.startPosition.column,
                  isExported,
                });
              }
            }
          }
        }
      }
      break;
    }

    case "arrow_function": {
      const pNode = node.childForFieldName("parameter");
      const psNode = node.childForFieldName("parameters");
      if (pNode) {
        if (pNode.type === "identifier") {
          // Single parameter arrow function: x => x + 1
          symbols.push({
            name: getText(pNode, code),
            type: "variable",
            file: filePath,
            line: pNode.startPosition.row + 1,
            column: pNode.startPosition.column,
            isExported: false,
          });
        } else if (
          pNode.type === "object_pattern" ||
          pNode.type === "array_pattern"
        ) {
          extractDestructuredNames(
            pNode,
            code,
            filePath,
            symbols,
            node.startPosition.row + 1,
          );
        }
      }
      if (psNode) {
        extractJSParams(psNode, code, filePath, symbols, options);
      }
      // Continue recursion to process function body, but parameter identifiers
      // will be skipped by the case "identifier" check below
      // IMPORTANT: Use return here, not break, to prevent falling through to
      // the recursive call at the end of extractJSSymbols. The recursive call
      // for arrow_function children is handled by the recursive call to
      // extractJSParams and subsequent processing.
      // Actually, we DO need to recurse into the function body to find nested symbols.
      // The break allows the loop at the end of extractJSSymbols to handle recursion.
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
            extractJSSymbols(child, code, filePath, symbols, className, options);
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
          const params = extractJSParams(paramsNode, code, filePath, symbols, options);
          const isAsync = node.children.some(
            (c: Parser.SyntaxNode) => getText(c, code) === "async",
          );
          
          // Extract return type for TypeScript methods
          const returnTypeNode = node.childForFieldName("return_type");
          const returnType = returnTypeNode ? getText(returnTypeNode, code) : undefined;

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
            returnType,
          });
        }
      }
      break;
    }

    // TypeScript class field declarations (private/public/protected properties)
    // e.g., class Foo { private bar: string = ''; }
    case "public_field_definition":
    case "private_field_definition":
    case "protected_field_definition":
    case "field_definition":
    case "property_definition": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const name = getText(nameNode, code);
        symbols.push({
          name,
          type: "variable",
          file: filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          scope: currentClass || undefined,
        });
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

    // Object literals: const api = { method: () => {} }
    // Extract methods from object literals to support API client patterns
    case "object": {
      // Check if this object is the value of a variable declarator
      // This handles: const timeEntriesApi = { getPending: async () => {} }
      const parent = node.parent;
      let parentVariableName: string | null = null;
      
      if (parent?.type === "variable_declarator") {
        const nameNode = parent.childForFieldName("name");
        if (nameNode?.type === "identifier") {
          parentVariableName = getText(nameNode, code);
        }
      }
      
      // Extract all method properties from the object literal
      for (const child of node.children) {
        if (child.type === "pair") {
          const keyNode = child.childForFieldName("key");
          const valueNode = child.childForFieldName("value");
          
          if (keyNode && valueNode) {
            const keyName = getText(keyNode, code);
            
            // Check if the value is a function (arrow_function, function, or call_expression that returns a function)
            const isFunctionValue = 
              valueNode.type === "arrow_function" ||
              valueNode.type === "function";
            
            if (isFunctionValue) {
              const paramsNode = valueNode.childForFieldName("parameters") || valueNode.childForFieldName("parameter");
              // Pass undefined for symbols to avoid registering params as local variables
              // We only want the parameter names for the method signature
              const params = extractJSParams(paramsNode, code, filePath, undefined, options);
              const isAsync = valueNode.children.some(
                (c: Parser.SyntaxNode) => getText(c, code) === "async",
              );
              
              // Register as a method with scope = parent variable name
              // Note: We don't extract params here - let recursion handle it
              // to avoid duplicate parameter symbols
              symbols.push({
                name: keyName,
                type: "method",
                file: filePath,
                line: child.startPosition.row + 1,
                column: child.startPosition.column,
                params,
                paramCount: params.length,
                scope: parentVariableName || undefined,
                isAsync,
                isExported: parent?.parent?.parent?.type === "export_statement",
              });
              
              // Recurse into the arrow function to extract its parameter symbols
              // This ensures parameters like (id) in { mutationFn: (id) => ... } are registered
              extractJSSymbols(valueNode, code, filePath, symbols, null, options);
            } else {
              // Not a function value, recurse to find any nested symbols
              extractJSSymbols(valueNode, code, filePath, symbols, null, options);
            }
          }
        }
        // Handle shorthand methods: { method() {} }
        else if (child.type === "method_definition") {
          const nameNode = child.childForFieldName("name");
          const paramsNode = child.childForFieldName("parameters");
          
          if (nameNode) {
            const name = getText(nameNode, code);
            // Pass symbols to register params as local variables
            const params = extractJSParams(paramsNode, code, filePath, symbols, options);
            const isAsync = child.children.some(
              (c: Parser.SyntaxNode) => getText(c, code) === "async",
            );
            
            // Extract return type for TypeScript methods
            const returnTypeNode = child.childForFieldName("return_type");
            const returnType = returnTypeNode ? getText(returnTypeNode, code) : undefined;
            
            symbols.push({
              name,
              type: "method",
              file: filePath,
              line: child.startPosition.row + 1,
              column: child.startPosition.column,
              params,
              paramCount: params.length,
              scope: parentVariableName || undefined,
              isAsync,
              isExported: parent?.parent?.parent?.type === "export_statement",
              returnType,
            });
            
            // Recurse into method body to extract any nested symbols
            const bodyNode = child.childForFieldName("body");
            if (bodyNode) {
              extractJSSymbols(bodyNode, code, filePath, symbols, null, options);
            }
          }
        } else if (child.type !== "{" && child.type !== "}" && child.type !== ",") {
          // Recurse into other children (but skip punctuation)
          extractJSSymbols(child, code, filePath, symbols, null, options);
        }
      }
      // Use break (not return) so we don't process the same nodes again in the main recursion
      // But we've already handled all children, so this prevents double-processing
      return;
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
    // NOTE: Parameters are extracted by extractJSParams which is called from
    // function_declaration, arrow_function, and method_definition cases.
    // The function body will be processed by recursion into other children.
    case "formal_parameters":
    case "parameters":
    case "required_parameter":
    case "optional_parameter": {
      // Fall through to recursion - function body will be processed
      break;
    }
  }

  for (const child of node.children) {
    extractJSSymbols(child, code, filePath, symbols, currentClass, options);
  }
}

// ============================================================================
// Parameter Extraction
// ============================================================================

/**
 * Extract parameter names from a formal_parameters node.
 * Returns the parameter names for the function's params list.
 * For destructured parameters (object/array patterns), also registers the
 * individual variable names as symbols for validation purposes.
 */
export function extractJSParams(
  paramsNode: Parser.SyntaxNode | null,
  code: string,
  filePath: string = "",
  symbols?: ASTSymbol[],
  options: { includeParameterSymbols?: boolean } = {},
): string[] {
  if (!paramsNode) return [];

  const params: string[] = [];
  for (const child of paramsNode.children) {
    if (child.type === "identifier") {
      const name = getText(child, code);
      params.push(name);
      // ALWAYS register simple parameter identifiers as local symbols.
      // This prevents false positives where function parameters are flagged
      // as "undefinedVariable" when used within the function body.
      if (symbols) {
        symbols.push({
          name,
          type: "variable",
          file: filePath,
          line: child.startPosition.row + 1,
          column: child.startPosition.column,
        });
      }
    } else if (
      child.type === "required_parameter" ||
      child.type === "optional_parameter" ||
      child.type === "rest_pattern"
    ) {
      // Logic for destructuring or simple names in typed parameters
      // TypeScript: function foo({ x }: Type) or function foo(x: Type)
      const nameNode =
        child.childForFieldName("pattern") ||
        child.children.find(
          (c) =>
            c.type === "identifier" ||
            c.type === "rest_pattern" ||
            c.type === "object_pattern" ||
            c.type === "array_pattern",
        );

      if (nameNode) {
        if (nameNode.type === "object_pattern" || nameNode.type === "array_pattern") {
          // For destructured params, register the individual names as symbols
          // This is needed for validation to recognize them as defined variables
          if (symbols) {
            extractDestructuredNames(
              nameNode,
              code,
              filePath,
              symbols,
              nameNode.startPosition.row + 1,
            );
          }
          // For param list, we use the raw text
          params.push(getText(nameNode, code));
        } else if (nameNode.type === "rest_pattern") {
          const id = nameNode.children.find((c) => c.type === "identifier");
          if (id) {
            const name = getText(id, code);
            params.push(name);
            // Rest parameters are registered as symbols
            if (symbols) {
              symbols.push({
                name,
                type: "variable",
                file: filePath,
                line: id.startPosition.row + 1,
                column: id.startPosition.column,
              });
            }
          }
        } else if (nameNode.type === "identifier") {
          // Handle simple typed parameters: function foo(x: Type)
          const name = getText(nameNode, code);
          params.push(name);
          // ALWAYS register parameter symbols to prevent false positives
          // when validating local variable usage within the function scope
          if (symbols) {
            symbols.push({
              name,
              type: "variable",
              file: filePath,
              line: nameNode.startPosition.row + 1,
              column: nameNode.startPosition.column,
            });
          }
        }
      }
    } else if (child.type === "object_pattern" || child.type === "array_pattern") {
      // For destructured params at the top level, register the individual names
      if (symbols) {
        extractDestructuredNames(
          child,
          code,
          filePath,
          symbols,
          child.startPosition.row + 1,
        );
      }
      params.push(getText(child, code));
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
  depth: number = 0,
): void {
  if (!node || depth > 50) return; // Recursion loop guard

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
      // Handle { oldName: newName } - extract newName
      const valueNode = node.childForFieldName("value");
      if (valueNode) {
        extractDestructuredNames(valueNode, code, filePath, symbols, line, depth + 1);
      }
      break;
    }

    case "assignment_pattern": {
      // Handle [a = 1] or {a = 1} - extract the left side
      const leftNode = node.childForFieldName("left");
      if (leftNode) {
        extractDestructuredNames(leftNode, code, filePath, symbols, line, depth + 1);
      }
      break;
    }

    case "object_assignment_pattern": {
       // Handle { a = 1 } in object destructuring (with default value)
       for (const child of node.children) {
         // Only extract the identifier being defined, not the default value
         if (child.type === "shorthand_property_identifier_pattern" ||
             child.type === "identifier") {
           extractDestructuredNames(child, code, filePath, symbols, line, depth + 1);
         }
       }
       break;
    }

    case "object_pattern":
    case "array_pattern": {
      for (const child of node.children) {
        // Only recurse into relevant pattern parts (skip punctuation like {, }, [, ], commas)
        if (
          child.type === "pair_pattern" ||
          child.type === "shorthand_property_identifier_pattern" ||
          child.type === "object_pattern" ||
          child.type === "array_pattern" ||
          child.type === "assignment_pattern" ||
          child.type === "object_assignment_pattern" ||
          child.type === "identifier" ||
          child.type === "rest_pattern"
        ) {
          extractDestructuredNames(child, code, filePath, symbols, line, depth + 1);
        }
      }
      break;
    }
    
    case "rest_pattern": {
      // Handle ...rest - find the identifier inside
      for (const child of node.children) {
        if (child.type === "identifier") {
          extractDestructuredNames(child, code, filePath, symbols, line, depth + 1);
        }
      }
      break;
    }
  }
}

// ============================================================================
// Local Definition Collection (for JS/TS)
// ============================================================================

/**
 * Collect all locally-defined identifier names from JavaScript/TypeScript code.
 * This includes: variable declarations (const/let/var), function parameters,
 * for-of/for-in loop variables, catch clause variables, destructured names,
 * function/class declaration names.
 *
 * Used by the validator to prevent false positives on local variable references
 * and method calls (e.g., `for (const training of records) { training.status }`)
 */
export function collectJSLocalDefinitions(
  node: Parser.SyntaxNode,
  code: string,
  definitions: Set<string>,
): void {
  if (!node) return;

  switch (node.type) {
    case "variable_declarator": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        if (nameNode.type === "identifier") {
          definitions.add(getText(nameNode, code));
        } else if (nameNode.type === "object_pattern" || nameNode.type === "array_pattern") {
          collectDestructuredDefinitions(nameNode, code, definitions);
        }
      }
      break;
    }

    // For-in/for-of loop variable: for (const x of arr) / for (const x in obj)
    case "for_in_statement": {
      const leftNode = node.childForFieldName("left");
      if (leftNode) {
        if (leftNode.type === "identifier") {
          definitions.add(getText(leftNode, code));
        } else if (leftNode.type === "object_pattern" || leftNode.type === "array_pattern") {
          // Destructured loop variable: for (const [key, value] of entries)
          collectDestructuredDefinitions(leftNode, code, definitions);
        } else {
          // Could be lexical_declaration wrapping the variable
          collectJSLocalDefinitions(leftNode, code, definitions);
        }
      }
      break;
    }

    // Catch clause: catch (err) { ... }
    case "catch_clause": {
      const paramNode = node.childForFieldName("parameter");
      if (paramNode) {
        if (paramNode.type === "identifier") {
          definitions.add(getText(paramNode, code));
        } else if (paramNode.type === "object_pattern" || paramNode.type === "array_pattern") {
          collectDestructuredDefinitions(paramNode, code, definitions);
        }
      }
      break;
    }

    // Function/class declaration names
    case "function_declaration":
    case "class_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode && nameNode.type === "identifier") {
        definitions.add(getText(nameNode, code));
      }
      break;
    }

    // Function parameters
    case "required_parameter":
    case "optional_parameter": {
      const nameNode = node.childForFieldName("pattern") || node.childForFieldName("name");
      if (nameNode) {
        if (nameNode.type === "identifier") {
          definitions.add(getText(nameNode, code));
        } else if (nameNode.type === "object_pattern" || nameNode.type === "array_pattern") {
          collectDestructuredDefinitions(nameNode, code, definitions);
        }
      }
      break;
    }

    // Rest parameter: ...args
    case "rest_pattern": {
      for (const child of node.children) {
        if (child && child.type === "identifier") {
          definitions.add(getText(child, code));
        }
      }
      break;
    }

    // Enum declaration
    case "enum_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode && nameNode.type === "identifier") {
        definitions.add(getText(nameNode, code));
      }
      break;
    }
  }

  for (const child of node.children) {
    if (child) {
      collectJSLocalDefinitions(child, code, definitions);
    }
  }
}

/**
 * Collect identifier names from destructuring patterns (object/array).
 */
function collectDestructuredDefinitions(
  node: Parser.SyntaxNode,
  code: string,
  definitions: Set<string>,
): void {
  if (!node) return;

  for (const child of node.children) {
    if (!child) continue;

    if (child.type === "identifier") {
      definitions.add(getText(child, code));
    } else if (child.type === "shorthand_property_identifier_pattern") {
      definitions.add(getText(child, code));
    } else if (child.type === "pair_pattern") {
      const valueNode = child.childForFieldName("value");
      if (valueNode) {
        if (valueNode.type === "identifier") {
          definitions.add(getText(valueNode, code));
        } else if (valueNode.type === "object_pattern" || valueNode.type === "array_pattern") {
          collectDestructuredDefinitions(valueNode, code, definitions);
        } else if (valueNode.type === "assignment_pattern") {
          const leftNode = valueNode.childForFieldName("left");
          if (leftNode?.type === "identifier") {
            definitions.add(getText(leftNode, code));
          }
        }
      }
    } else if (child.type === "rest_pattern") {
      for (const restChild of child.children) {
        if (restChild?.type === "identifier") {
          definitions.add(getText(restChild, code));
        }
      }
    } else if (child.type === "assignment_pattern") {
      const leftNode = child.childForFieldName("left");
      if (leftNode?.type === "identifier") {
        definitions.add(getText(leftNode, code));
      }
    } else if (child.type === "object_pattern" || child.type === "array_pattern") {
      collectDestructuredDefinitions(child, code, definitions);
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

            // Skip built-in objects (console, window, etc.) but NOT imported symbols
            // We need to track method calls on imported symbols for validation
            // e.g., screen from @testing-library/react shadows the browser's window.screen
            //
            // EXCEPTION: If the builtin is cast to `any` (e.g., `(window as any).foo()`),
            // do NOT skip — the `as any` cast is a deliberate type-safety bypass,
            // which is a strong signal of a stealth hallucination.
            const rawObjText = getText(objNode, code);
            const isCastToAny = rawObjText.includes("as any") || rawObjText.includes("as unknown");
            if (isJSBuiltin(obj) && !externalSymbols.has(obj) && !isCastToAny) {
              // Skip method calls on built-in objects (Array.map, String.split, etc.)
              // These are standard library methods we don't need to validate
            } else {
              // Extract the root object from complex expressions like:
              // - (err as Type).property -> err
              // - arr[index].property -> arr[index]
              // - fn().property -> fn()
              const rootObj = getRootObject(objNode, code);
              usages.push({
                name: method,
                type: "methodCall",
                object: rootObj,
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
      // Don't recurse into children to avoid extracting the constructor name again as a reference
      return;
    }

    case "identifier":
    case "jsx_identifier":
    case "property_identifier":
    case "type_identifier": {
      const name = getText(node, code);

      // Skip built-in objects that are commonly used as property access base
      // (e.g., console in console.log, window in window.location)
      // These are handled specially and shouldn't be flagged as undefined references
      if (isJSBuiltin(name)) {
        // But only skip if it's being used as an object base (member_expression.object)
        const parent = node.parent;
        if (
          parent?.type === "member_expression" &&
          parent.childForFieldName("object")?.id === node.id
        ) {
          break; // Skip this identifier
        }
      }

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
                // NOTE: We intentionally do NOT add URLs as usages to validate.
                // URLs are string literals, not variables. Adding them as "reference"
                // type causes false positives (e.g., '/api/cli/generate-token' flagged
                // as undefined variable). This code block is kept for potential future
                // API endpoint validation but currently does nothing.
                //
                // if (!exists) {
                //   usages.push({
                //     name: url,
                //     type: "apiCall", // Custom type - not validated as variable
                //     line: node.startPosition.row + 1,
                //     column: node.startPosition.column,
                //     code: `API_CALL: ${url}`,
                //   });
                // }
              }
            }
          }
        }
      }

      // Only skip standard lowercase JSX tags (div, span, etc.)
      // tree-sitter-typescript/tsx uses plain "identifier" (not "jsx_identifier") for tag names
      // inside jsx_opening_element and jsx_closing_element, so check both node types
      if (node.type === "jsx_identifier" && /^[a-z]/.test(name)) break;
      if (node.type === "identifier" && /^[a-z]/.test(name)) {
        const p = node.parent;
        if (p?.type === "jsx_opening_element" || p?.type === "jsx_closing_element" || p?.type === "jsx_self_closing_element") {
          break;
        }
      }

      // Filter out non-usage positions:
      const parent = node.parent;
      if (!parent) break;

      // 0. Skip if inside a string literal or JSX text content
      // This prevents false positives like "Notes" in <h3>Comments & Notes</h3>
      // Also skip ERROR nodes inside JSX (parser errors from invalid JSX characters like &)
      let ancestor: Parser.SyntaxNode | null = parent;
      while (ancestor) {
        // template_substitution (${...}) is real code inside a template string
        // Don't skip identifiers inside substitution expressions
        if (ancestor.type === "template_substitution") break;

        if (
          ancestor.type === "string" ||
          ancestor.type === "template_string" ||
          ancestor.type === "jsx_text" ||
          ancestor.type === "string_fragment"
        ) {
          return; // Don't process this identifier at all
        }
        // Skip identifiers inside ERROR nodes that are within JSX elements
        // This happens when JSX contains invalid characters like unescaped &
        if (ancestor.type === "ERROR") {
          // Check if this ERROR is within a JSX element
          let jsxAncestor: Parser.SyntaxNode | null = ancestor.parent;
          while (jsxAncestor) {
            if (
              jsxAncestor.type === "jsx_element" ||
              jsxAncestor.type === "jsx_self_closing_element" ||
              jsxAncestor.type === "jsx_expression" ||
              jsxAncestor.type === "jsx_fragment"
            ) {
              return; // This is an identifier in invalid JSX text, skip it
            }
            jsxAncestor = jsxAncestor.parent;
          }
        }
        ancestor = ancestor.parent;
      }

      // 1. Handle member expression property access (x.NAME)
      // This is used for method references like: { queryFn: api.getMethod }
      if (
        (parent.type === "member_expression" ||
          parent.type === "jsx_member_expression") &&
        parent.childForFieldName("property")?.id === node.id
      ) {
        const objNode = parent.childForFieldName("object");
        // Use getRootObject to handle complex expressions like (err as Type).property
        const objName = objNode ? getRootObject(objNode, code) : "";
        
        // Special case: member_expression inside JSX-misparsed context
        // This happens with: <button aria-label="Close" role="button">
        // where 'role' becomes property_identifier in member_expression inside assignment_expression
        // Check if we're in a JSX-like context
        let isInJsxContext = false;
        let ancestor: Parser.SyntaxNode | null = parent.parent;
        while (ancestor) {
          if (ancestor.type === "ERROR") {
            // Check if this ERROR looks like it came from JSX parsing
            isInJsxContext = true;
            break;
          }
          // Check for JSX-misparsed patterns
          // Pattern: binary_expression containing type_assertion followed by - followed by assignment_expression
          // This is the structure from: <button aria-label="..." role="...">
          if (ancestor.type === "binary_expression") {
            const grandparent = ancestor.parent;
            if (grandparent) {
              const ancestorIndex = grandparent.children.indexOf(ancestor);
              // Check if binary_expression is at the right position
              if (ancestorIndex >= 0) {
                // Check if binary_expression contains: type_assertion, -, assignment_expression
                const typeAssertChild = ancestor.children.find(c => c.type === "type_assertion");
                const dashChild = ancestor.children.find(c => c.type === "-" || c.text === "-");
                const assignChild = ancestor.children.find(c => c.type === "assignment_expression");
                
                if (typeAssertChild && dashChild && assignChild) {
                  isInJsxContext = true;
                  break;
                }
              }
            }
          }
          if (ancestor.type === "jsx_expression" || ancestor.type === "jsx_element") {
            // Real JSX context - don't skip here, let the jsx_attribute check handle it
            isInJsxContext = false;
            break;
          }
          ancestor = ancestor.parent;
        }
        
        if (isInJsxContext) {
          // Skip this property_identifier - it's likely a JSX attribute name
          // that got misparsed as member_expression due to parser confusion
          break;
        }
        
        // Detect store property access: state.hallucination
        if (objName === "state") {
          // We ALLOW this to be processed as a usage to catch hallucinations in stores
        } else if (!isJSBuiltin(objName)) {
          // Track method/property access on non-built-in objects
          // This handles cases like: { queryFn: paymentsApi.getPaymentMethods }
          usages.push({
            name: name,
            type: "methodCall",
            object: objName,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            code: getLineText(code, node.startPosition.row),
          });
        }
        break;
      }

      // 2. Skip if it's a field name in an object literal ({ NAME: val })
      if (parent.type === "pair" && parent.childForFieldName("key")?.id === node.id)
        break;

      // 2a. Skip if it's a property name in an interface or type literal
      // e.g., interface Foo { bar: string } or type Foo = { bar: string }
      // The property name is a definition, not a usage of an external variable
      if (parent.type === "property_signature" && parent.childForFieldName("name")?.id === node.id)
        break;

      // 2b. Skip if it's a class field declaration (public/private/protected property)
      // e.g., class Foo { private bar: string }
      // TypeScript uses public_field_definition, private_field_definition, etc.
      // Note: property_identifier is used as the name node for class fields
      if ((parent.type === "property_definition" || 
           parent.type === "public_field_definition" ||
           parent.type === "private_field_definition" ||
           parent.type === "protected_field_definition" ||
           parent.type === "field_definition") && 
          parent.childForFieldName("name")?.id === node.id)
        break;

      // 2c. Skip if it's a JSX attribute name (e.g., <div className="foo" />)
      // These are HTML/SVG/React props, not variable references
      // JSX attributes have the name as the first child (property_identifier or jsx_identifier)
      if (parent.type === "jsx_attribute" && parent.children[0]?.id === node.id)
        break;
      
      // 2d. Skip property_identifier when it's used as a JSX attribute name
      // This handles cases where JSX parsing produces different AST structures
      // e.g., <img src={url} /> where 'src' might be parsed as property_identifier
      // or <button role="..."> where 'role' is parsed as property_identifier in member_expression
      if (node.type === "property_identifier") {
        // Check if this property_identifier is inside a JSX attribute context
        let ancestor: Parser.SyntaxNode | null = parent;
        while (ancestor) {
          if (ancestor.type === "jsx_attribute") {
            // This property_identifier is the attribute name
            if (ancestor.children[0]?.id === node.id || 
                (ancestor.childForFieldName("name")?.id === node.id)) {
              return; // Skip - this is a JSX attribute name, not a variable reference
            }
          }
          // Also check for ERROR nodes that might contain JSX attributes
          if (ancestor.type === "ERROR") {
            // Check if this property_identifier is followed by = in an ERROR node
            // by looking at the parent's siblings
            const grandparent = ancestor.parent;
            if (grandparent) {
              const ancestorIndex = grandparent.children.indexOf(ancestor);
              if (ancestorIndex >= 0) {
                const nextAtAncestorLevel = grandparent.children[ancestorIndex + 1];
                if (nextAtAncestorLevel && nextAtAncestorLevel.type === "=") {
                  return; // This looks like a JSX attribute name in an ERROR node
                }
              }
            }
            
            // Special case: property_identifier inside member_expression inside ERROR
            // This happens with: <button aria-label="Close" role="button">
            // where 'role' becomes property_identifier in member_expression
            if (parent.type === "member_expression") {
              // Check if the member_expression is followed by = in the ERROR node
              const memberExprIndex = ancestor.children.indexOf(parent);
              if (memberExprIndex >= 0) {
                const nextAfterMember = ancestor.children[memberExprIndex + 1];
                if (nextAfterMember && nextAfterMember.type === "=") {
                  return; // This looks like a JSX attribute name (role=)
                }
              }
            }
          }
          ancestor = ancestor.parent;
        }
        
        // Additional check: property_identifier in member_expression that's part of
        // a JSX-like pattern even without ERROR nodes
        // This handles: <button aria-label="Close menu" role="button">
        // where 'role' is property_identifier in member_expression in assignment_expression
        if (parent.type === "member_expression") {
          // Check if this member_expression has a specific pattern suggesting JSX misparsing
          // Pattern: string + ?. + property_identifier followed by = 
          // This is "value"?.property = something
          const objNode = parent.childForFieldName("object");
          const propNode = parent.childForFieldName("property");
          
          if (objNode?.type === "string" && propNode === node) {
            // The member_expression looks like "string"?.property
            // Check if parent of member_expression is followed by =
            const grandparent = parent.parent;
            if (grandparent) {
              const parentIndex = grandparent.children.indexOf(parent);
              if (parentIndex >= 0) {
                const nextAfterParent = grandparent.children[parentIndex + 1];
                if (nextAfterParent && nextAfterParent.type === "=") {
                  // This looks like "value"?.attr = value pattern from JSX parsing
                  return; // Skip - this is a JSX attribute name
                }
              }
            }
          }
        }
      }
      
      // 2e. Skip identifiers/type_identifiers that are actually JSX attribute names
      // This handles cases where JSX parsing produces type-related AST nodes
      // e.g., <img src={url} /> where 'src' might be parsed as type_identifier
      // or <Tag attr={val} /> where 'attr' is an identifier inside an ERROR node
      if (node.type === "identifier" || node.type === "type_identifier") {
        // First check: is this identifier directly followed by = in its parent?
        // This handles: <Tag attr={val} /> where attr is an identifier child of ERROR
        const nodeIndexInParent = parent.children.indexOf(node as any);
        if (nodeIndexInParent >= 0) {
          const nextSibling = parent.children[nodeIndexInParent + 1];
          if (nextSibling && (
            nextSibling.type === "=" || 
            nextSibling.text === "="
          )) {
            return; // Skip - this is attr= pattern (JSX attribute name)
          }
          
          // Handle hyphenated attributes like aria-label, data-testid
          // Pattern: attr-name= (identifier, -, identifier, =)
          if (nextSibling && (
            nextSibling.type === "-" || 
            nextSibling.text === "-"
          )) {
            const nextNextSibling = parent.children[nodeIndexInParent + 2];
            const nextNextNextSibling = parent.children[nodeIndexInParent + 3];
            if (nextNextSibling && nextNextSibling.type === "identifier") {
              // Check if after the second part there's an = 
              if (nextNextNextSibling && (
                nextNextNextSibling.type === "=" || 
                nextNextNextSibling.text === "="
              )) {
                return; // Skip - this is aria-label= pattern (JSX attribute name)
              }
            }
          }
          
          // Handle identifiers in type_assertion that are actually JSX attribute names
          // Pattern: <button aria-label="..."> where 'aria' is parsed as type_assertion's expression
          // The structure is: type_assertion (type_arguments + identifier) - assignment_expression
          if (parent.type === "type_assertion") {
            // Check if type_assertion is followed by - (aria- pattern)
            const parentIndex = parent.parent?.children.indexOf(parent);
            if (parentIndex !== undefined && parentIndex >= 0 && parent.parent) {
              const nextAfterParent = parent.parent.children[parentIndex + 1];
              if (nextAfterParent && (
                nextAfterParent.type === "-" || 
                nextAfterParent.text === "-"
              )) {
                return; // Skip - this looks like aria-label pattern
              }
            }
          }
        }
        
        // Check if this is inside a JSX-like context (ERROR node or type_parameters)
        // where the identifier is followed by = or has JSX-like structure
        let ancestor: Parser.SyntaxNode | null = parent;
        while (ancestor) {
          // Check if we're inside what looks like a JSX element
          if (ancestor.type === "ERROR" || ancestor.type === "type_parameters" || 
              ancestor.type === "type_arguments") {
            
            // For type_identifiers inside type_parameter (e.g., src={val} parsed as type)
            // Structure: type_parameter -> type_identifier (attr name) -> default_type (=value)
            if (parent.type === "type_parameter") {
              // Check if there's a default_type (the =value part) after this type_identifier
              const nodeIndex = parent.children.indexOf(node as any);
              if (nodeIndex >= 0) {
                const nextSibling = parent.children[nodeIndex + 1];
                if (nextSibling && nextSibling.type === "default_type") {
                  return; // Skip - this looks like attr={value} pattern
                }
              }
            }
            
            // Handle identifiers inside ERROR nodes that are inside type_parameter
            // This happens with: <Tag type="file" /> where 'type' is parsed as type_identifier
            // Structure: type_parameter -> ERROR (only child is identifier "type") -> default_type
            if (parent.type === "ERROR") {
              const grandparent = parent.parent;
              
              // Case 1: ERROR is inside type_parameter, and ERROR only contains this identifier
              // This is the "type" in <input type="file" ...>
              if (grandparent && grandparent.type === "type_parameter") {
                // Check if ERROR only has one child (this identifier)
                if (parent.children.length === 1 && parent.children[0]?.id === node.id) {
                  // Check if the ERROR is followed by default_type in type_parameter
                  const errorIndex = grandparent.children.indexOf(parent);
                  if (errorIndex >= 0) {
                    const nextAfterError = grandparent.children[errorIndex + 1];
                    if (nextAfterError && nextAfterError.type === "default_type") {
                      return; // Skip - this is a JSX attribute name
                    }
                  }
                }
              }
              
              // Case 2: ERROR is inside default_type, containing multiple identifiers
              // This is "multiple" or "accept" in <input type="file" multiple accept="..." />
              const greatGrandparent = grandparent?.parent;
              if (grandparent?.type === "default_type" && greatGrandparent?.type === "type_parameter") {
                // This ERROR contains multiple identifiers and/or literal_types
                // Check if this identifier follows a literal_type (boolean attr after value)
                const nodeIndex = parent.children.indexOf(node as any);
                const prevSibling = nodeIndex > 0 ? parent.children[nodeIndex - 1] : null;
                
                if (prevSibling && (
                  prevSibling.type === "literal_type" ||
                  prevSibling.type === "identifier"
                )) {
                  return; // Skip - this looks like a boolean JSX attribute after a value
                }
              }
            }
          }
          
          // Check if we're inside a jsx_expression - this is the {value} part, not the attribute name
          if (ancestor.type === "jsx_expression") {
            break; // Don't skip - identifiers inside { } are actual variable references
          }
          
          ancestor = ancestor.parent;
        }
      }

      // 2f. Skip identifiers inside nested_identifier (type-level namespace access)
      // e.g., Express.Multer.File[] — Express and Multer are namespace types, not variable references
      if (parent.type === "nested_identifier" || parent.type === "nested_type_identifier") break;

      // 3. Skip if it's a function/class/variable declaration name
      if (
        (parent.type === "function_declaration" ||
          parent.type === "class_declaration" ||
          parent.type === "variable_declarator" ||
          parent.type === "method_definition" ||
          parent.type === "interface_declaration" ||
          parent.type === "type_alias_declaration") &&
        parent.childForFieldName("name")?.id === node.id
      )
        break;

      // 3a. Skip if it's the name of a function expression
      // e.g., return function ProtectedComponent(props: P) { ... }
      // The 'ProtectedComponent' here is a local name for the function expression,
      // NOT a reference to an external variable
      // Note: Tree-sitter uses "function_expression" for function expressions, not "function"
      if ((parent.type === "function" || parent.type === "function_expression") && 
          parent.childForFieldName("name")?.id === node.id) {
        break;
      }

      // 3b. Skip TypeScript generic type parameter declarations
      // e.g., <T> in function foo<T>(...) — T is declared here, not a reference
      if (parent.type === "type_parameter" || parent.type === "type_parameters")
        break;

      // 3c. Skip generic type parameter USAGES (T, P, K, V, etc.) in type positions
      // These are single-letter uppercase identifiers used in type annotations/arguments
      // that were declared as generic params, not imported symbols
      if (node.type === "type_identifier" && /^[A-Z]$/.test(name)) break;

      // 3d. Skip type_identifier that is the property part of a qualified type name
      // e.g., ErrorInfo in React.ErrorInfo — this is a namespace property, not a standalone reference
      if (node.type === "type_identifier" && parent.type === "nested_type_identifier") break;

      // 4. Skip if it's a formal parameter (including rest parameters)
      if (
        parent.type === "formal_parameters" ||
        parent.type === "required_parameter" ||
        parent.type === "optional_parameter" ||
        parent.type === "rest_pattern"
      )
        break;

      // 5. Skip if it's the property in shorthand ({ name }) - this IS a usage of the outer 'name'
      // but Tree-sitter treats it as a 'shorthand_property_identifier'.
      if (parent.type === "shorthand_property_identifier") {
        // This IS a usage.
      }

      // 6. Skip if it's part of an import statement (handled separately)
      // Note: export_specifier is NOT skipped — re-exports like `export type { Project }`
      // should count as usages so the original import isn't flagged as unused
      if (parent.type === "import_specifier")
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
      let isTypeOnly = false;

      for (const child of node.children) {
        if (!child) continue;

        // Detect "import type" - TypeScript specific
        if (child.type === "type") {
          isTypeOnly = true;
        }

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
        isTypeOnly,
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

/**
 * Extract the root object identifier from a complex expression.
 * Handles cases like:
 * - (err as Type) -> err (unwraps parenthesized expressions and type assertions)
 * - obj.property -> obj
 * - arr[index] -> arr
 * - identifier -> identifier
 * 
 * @param node - The AST node representing the object in a member expression
 * @param code - The source code string
 * @returns The root object text (variable name)
 */
function getRootObject(node: Parser.SyntaxNode, code: string): string {
  if (!node) return "";
  
  // Handle parenthesized expressions: (expr)
  // This includes type assertions like (err as Error) or (err satisfies Error)
  if (node.type === "parenthesized_expression") {
    // Find the inner expression (skip the parentheses)
    for (const child of node.children) {
      if (child.type !== "(" && child.type !== ")") {
        return getRootObject(child, code);
      }
    }
  }
  
  // Handle type assertion expressions: expr as Type, expr satisfies Type
  if (node.type === "as_expression" || node.type === "satisfies_expression") {
    const leftNode = node.childForFieldName("left") || node.children[0];
    if (leftNode) {
      return getRootObject(leftNode, code);
    }
  }
  
  // Handle non-null assertion expressions: expr!
  if (node.type === "non_null_expression") {
    const expression = node.children[0];
    if (expression) {
      return getRootObject(expression, code);
    }
  }
  
  // Handle call expressions: fn() - extract the function name
  if (node.type === "call_expression" || node.type === "new_expression") {
    const funcNode = node.childForFieldName("function") || node.childForFieldName("constructor");
    if (funcNode) {
      return getRootObject(funcNode, code);
    }
  }
  
  // Handle member expressions: obj.prop - recurse into the object to get the root identifier
  // This correctly handles multiline chains like db\n.select().from() → "db"
  // Previously returned getText which included newlines, causing FPs in validation
  if (node.type === "member_expression") {
    const objNode = node.childForFieldName("object");
    if (objNode) {
      return getRootObject(objNode, code);
    }
    return getText(node, code);
  }
  
  // Handle subscript expressions: arr[index] - return the full text
  if (node.type === "subscript_expression") {
    return getText(node, code);
  }
  
  // Base case: identifier or simple expression
  return getText(node, code);
}
