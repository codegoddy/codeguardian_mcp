/**
 * Tree-sitter Based Parser
 * 
 * Accurate, fast parsing using Tree-sitter for multiple languages.
 * Handles edge cases, nested scopes, and complex syntax correctly.
 */

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import {
  CodeGraph,
  SymbolNode,
  SymbolType,
  Location,
  Reference,
  ImportNode,
  ExportNode,
  Scope,
  ParseResult,
  ParserConfig,
  TypeInfo,
  DependencyEdge
} from '../../types/codeGraph.js';
import { logger } from '../../utils/logger.js';
import * as crypto from 'crypto';

export class TreeSitterParser {
  private parsers = new Map<string, Parser>();
  private config: ParserConfig;

  constructor(config?: Partial<ParserConfig>) {
    this.config = {
      language: 'typescript',
      enableIncremental: true,
      resolveTypes: true,
      buildCallGraph: true,
      maxFileSize: 1024 * 1024 * 5, // 5MB default
      parallelParsing: false,
      cacheResults: true,
      ...config
    };

    this.initializeParsers();
  }

  private initializeParsers(): void {
    try {
      // TypeScript parser
      const tsParser = new Parser();
      tsParser.setLanguage(TypeScript);
      this.parsers.set('typescript', tsParser);

      // JavaScript parser
      const jsParser = new Parser();
      jsParser.setLanguage(JavaScript);
      this.parsers.set('javascript', jsParser);

      // Python parser
      const pyParser = new Parser();
      pyParser.setLanguage(Python);
      this.parsers.set('python', pyParser);

      logger.debug('Tree-sitter parsers initialized');
    } catch (e) {
      logger.error('Failed to initialize tree-sitter parsers', e);
    }
  }

  /**
   * Parse code and build complete CodeGraph
   */
  async parse(code: string, filePath: string, language: string): Promise<ParseResult> {
    const startTime = Date.now();
    const errors: ParseResult['errors'] = [];

    try {
      const parser = this.parsers.get(language);
      if (!parser) {
        throw new Error(`No parser available for language: ${language}`);
      }

      // Parse to AST
      const tree = parser.parse(code);
      
      if (!tree.rootNode) {
        throw new Error('Failed to parse code - no root node');
      }

      // Build CodeGraph from AST
      const graph = await this.buildCodeGraph(tree, code, filePath, language);

      const parseTime = Date.now() - startTime;
      logger.debug(`Parsed ${filePath} in ${parseTime}ms`);

      return {
        graph,
        errors,
        parseTime
      };
    } catch (error) {
      logger.error('Parse error:', error);
      errors.push({
        message: error instanceof Error ? error.message : 'Unknown parse error',
        location: { file: filePath, line: 0, column: 0 },
        severity: 'error'
      });

      // Return empty graph on error
      return {
        graph: this.createEmptyGraph(),
        errors,
        parseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Build CodeGraph from Tree-sitter AST
   */
  private async buildCodeGraph(
    tree: Parser.Tree,
    code: string,
    filePath: string,
    language: string
  ): Promise<CodeGraph> {
    const graph: CodeGraph = this.createEmptyGraph();
    const fileHash = this.computeHash(code);
    
    graph.fileHashes.set(filePath, fileHash);
    graph.lastUpdated = new Date();

    // Initialize global scope
    graph.globalScope = {
      name: 'global',
      type: 'global',
      symbols: new Map(),
      children: []
    };

    // Create file scope
    const fileScope: Scope = {
      name: filePath,
      type: 'module',
      parent: graph.globalScope,
      symbols: new Map(),
      children: [],
      location: { file: filePath, line: 0, column: 0 }
    };
    
    graph.globalScope.children.push(fileScope);
    graph.scopes.set(filePath, fileScope);

    // Traverse AST and extract symbols
    const cursor = tree.walk();
    
    switch (language) {
      case 'typescript':
      case 'javascript':
        await this.extractJavaScriptSymbols(cursor, code, filePath, graph, fileScope);
        break;
      case 'python':
        await this.extractPythonSymbols(cursor, code, filePath, graph, fileScope);
        break;
      default:
        logger.warn(`Symbol extraction not implemented for ${language}`);
    }

    return graph;
  }

  /**
   * Extract symbols from JavaScript/TypeScript AST
   */
  private async extractJavaScriptSymbols(
    cursor: Parser.TreeCursor,
    code: string,
    filePath: string,
    graph: CodeGraph,
    currentScope: Scope
  ): Promise<void> {
    const visited = new Set<number>();

    const traverse = (node: Parser.SyntaxNode, scope: Scope) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);

      const nodeType = node.type;
      const location: Location = {
        file: filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column
      };

      // Function declarations
      if (nodeType === 'function_declaration' || nodeType === 'function') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const funcName = code.substring(nameNode.startIndex, nameNode.endIndex);
          const symbol = this.createFunctionSymbol(funcName, location, node, code, scope);
          this.addSymbol(graph, symbol, scope, filePath);

          // Create function scope
          const funcScope: Scope = {
            name: funcName,
            type: 'function',
            parent: scope,
            symbols: new Map(),
            children: [],
            location
          };
          scope.children.push(funcScope);

          // Process function body
          const bodyNode = node.childForFieldName('body');
          if (bodyNode) {
            for (const child of bodyNode.children) {
              traverse(child, funcScope);
            }
          }
          return;
        }
      }

      // Arrow functions
      if (nodeType === 'arrow_function') {
        const parent = node.parent;
        if (parent && parent.type === 'variable_declarator') {
          const nameNode = parent.childForFieldName('name');
          if (nameNode) {
            const funcName = code.substring(nameNode.startIndex, nameNode.endIndex);
            const symbol = this.createFunctionSymbol(funcName, location, node, code, scope);
            this.addSymbol(graph, symbol, scope, filePath);
          }
        }
      }

      // Method definitions
      if (nodeType === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const methodName = code.substring(nameNode.startIndex, nameNode.endIndex);
          const symbol = this.createFunctionSymbol(methodName, location, node, code, scope);
          symbol.type = 'method';
          this.addSymbol(graph, symbol, scope, filePath);

          // Create method scope
          const methodScope: Scope = {
            name: methodName,
            type: 'function',
            parent: scope,
            symbols: new Map(),
            children: [],
            location
          };
          scope.children.push(methodScope);

          // Process method body
          const bodyNode = node.childForFieldName('body');
          if (bodyNode) {
            for (const child of bodyNode.children) {
              traverse(child, methodScope);
            }
          }
          return;
        }
      }

      // Class declarations
      if (nodeType === 'class_declaration' || nodeType === 'class') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const className = code.substring(nameNode.startIndex, nameNode.endIndex);
          const symbol: SymbolNode = {
            name: className,
            type: 'class',
            location,
            usages: [],
            definedIn: scope.name,
            properties: new Map(),
            methods: new Map()
          };
          this.addSymbol(graph, symbol, scope, filePath);

          // Create class scope
          const classScope: Scope = {
            name: className,
            type: 'class',
            parent: scope,
            symbols: new Map(),
            children: [],
            location
          };
          scope.children.push(classScope);

          // Process class body
          const bodyNode = node.childForFieldName('body');
          if (bodyNode) {
            for (const child of bodyNode.children) {
              traverse(child, classScope);
            }
          }
          return;
        }
      }

      // Variable declarations
      if (nodeType === 'variable_declarator') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const varName = code.substring(nameNode.startIndex, nameNode.endIndex);
          const symbol: SymbolNode = {
            name: varName,
            type: 'variable',
            location,
            usages: [],
            definedIn: scope.name
          };
          this.addSymbol(graph, symbol, scope, filePath);
        }
      }

      // Import statements
      if (nodeType === 'import_statement') {
        this.extractImport(node, code, filePath, graph);
      }

      // Export statements
      if (nodeType === 'export_statement') {
        this.extractExport(node, code, filePath, graph);
      }

      // Call expressions (for call graph)
      if (nodeType === 'call_expression') {
        this.extractCallExpression(node, code, graph, scope);
      }

      // Identifier references
      if (nodeType === 'identifier') {
        const name = code.substring(node.startIndex, node.endIndex);
        const ref: Reference = {
          name,
          location,
          type: 'usage',
          scope: scope.name
        };
        
        const refs = graph.references.get(name) || [];
        refs.push(ref);
        graph.references.set(name, refs);
      }

      // Traverse children
      for (const child of node.children) {
        traverse(child, scope);
      }
    };

    traverse(cursor.currentNode, currentScope);
  }

  /**
   * Extract symbols from Python AST
   */
  private async extractPythonSymbols(
    cursor: Parser.TreeCursor,
    code: string,
    filePath: string,
    graph: CodeGraph,
    currentScope: Scope
  ): Promise<void> {
    const visited = new Set<number>();

    const traverse = (node: Parser.SyntaxNode, scope: Scope) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);

      const nodeType = node.type;
      const location: Location = {
        file: filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column
      };

      // Function definitions
      if (nodeType === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const funcName = code.substring(nameNode.startIndex, nameNode.endIndex);
          const symbol = this.createPythonFunctionSymbol(funcName, location, node, code, scope);
          this.addSymbol(graph, symbol, scope, filePath);

          // Create function scope
          const funcScope: Scope = {
            name: funcName,
            type: 'function',
            parent: scope,
            symbols: new Map(),
            children: [],
            location
          };
          scope.children.push(funcScope);

          // Process function body
          const bodyNode = node.childForFieldName('body');
          if (bodyNode) {
            for (const child of bodyNode.children) {
              traverse(child, funcScope);
            }
          }
          return;
        }
      }

      // Class definitions
      if (nodeType === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const className = code.substring(nameNode.startIndex, nameNode.endIndex);
          const symbol: SymbolNode = {
            name: className,
            type: 'class',
            location,
            usages: [],
            definedIn: scope.name,
            properties: new Map(),
            methods: new Map()
          };
          this.addSymbol(graph, symbol, scope, filePath);

          // Create class scope
          const classScope: Scope = {
            name: className,
            type: 'class',
            parent: scope,
            symbols: new Map(),
            children: [],
            location
          };
          scope.children.push(classScope);

          // Process class body
          const bodyNode = node.childForFieldName('body');
          if (bodyNode) {
            for (const child of bodyNode.children) {
              traverse(child, classScope);
            }
          }
          return;
        }
      }

      // Assignment (variables)
      if (nodeType === 'assignment') {
        const leftNode = node.childForFieldName('left');
        if (leftNode && leftNode.type === 'identifier') {
          const varName = code.substring(leftNode.startIndex, leftNode.endIndex);
          const symbol: SymbolNode = {
            name: varName,
            type: 'variable',
            location,
            usages: [],
            definedIn: scope.name
          };
          this.addSymbol(graph, symbol, scope, filePath);
        }
      }

      // Import statements
      if (nodeType === 'import_statement' || nodeType === 'import_from_statement') {
        this.extractPythonImport(node, code, filePath, graph);
      }

      // Call expressions (for call graph)
      if (nodeType === 'call') {
        this.extractPythonCallExpression(node, code, graph, scope);
      }

      // Identifier references
      if (nodeType === 'identifier') {
        const name = code.substring(node.startIndex, node.endIndex);
        const ref: Reference = {
          name,
          location,
          type: 'usage',
          scope: scope.name
        };
        
        const refs = graph.references.get(name) || [];
        refs.push(ref);
        graph.references.set(name, refs);
      }

      // Traverse children
      for (const child of node.children) {
        traverse(child, scope);
      }
    };

    traverse(cursor.currentNode, currentScope);
  }

  /**
   * Create function symbol with signature
   */
  private createFunctionSymbol(
    name: string,
    location: Location,
    node: Parser.SyntaxNode,
    code: string,
    scope: Scope
  ): SymbolNode {
    const paramsNode = node.childForFieldName('parameters');
    const parameters: string[] = [];
    
    if (paramsNode) {
      for (const param of paramsNode.children) {
        if (param.type === 'identifier' || param.type === 'required_parameter') {
          const paramName = code.substring(param.startIndex, param.endIndex);
          parameters.push(paramName);
        }
      }
    }

    // Check if async
    const isAsync = node.children.some(c => c.type === 'async');

    return {
      name,
      type: 'function',
      location,
      usages: [],
      definedIn: scope.name,
      parameters,
      isAsync,
      signature: this.buildSignature(parameters, node, code)
    };
  }

  /**
   * Create Python function symbol
   */
  private createPythonFunctionSymbol(
    name: string,
    location: Location,
    node: Parser.SyntaxNode,
    code: string,
    scope: Scope
  ): SymbolNode {
    const paramsNode = node.childForFieldName('parameters');
    const parameters: string[] = [];
    
    if (paramsNode) {
      for (const param of paramsNode.children) {
        if (param.type === 'identifier' || param.type === 'typed_parameter') {
          const nameNode = param.type === 'typed_parameter' 
            ? param.childForFieldName('name') 
            : param;
          if (nameNode) {
            const paramName = code.substring(nameNode.startIndex, nameNode.endIndex);
            if (paramName !== 'self' && paramName !== 'cls') {
              parameters.push(paramName);
            }
          }
        }
      }
    }

    // Check if async
    const isAsync = node.parent?.type === 'decorated_definition' || 
                   code.substring(node.startIndex, node.startIndex + 10).includes('async');

    return {
      name,
      type: 'function',
      location,
      usages: [],
      definedIn: scope.name,
      parameters,
      isAsync,
      signature: `def ${name}(${parameters.join(', ')})`
    };
  }

  /**
   * Build function signature
   */
  private buildSignature(parameters: string[], node: Parser.SyntaxNode, code: string): string {
    const params = parameters.join(', ');
    // Try to get return type if available (TypeScript)
    const returnTypeNode = node.childForFieldName('return_type');
    if (returnTypeNode) {
      const returnType = code.substring(returnTypeNode.startIndex, returnTypeNode.endIndex);
      return `(${params}) => ${returnType}`;
    }
    return `(${params})`;
  }

  /**
   * Extract import statement
   */
  private extractImport(
    node: Parser.SyntaxNode,
    code: string,
    filePath: string,
    graph: CodeGraph
  ): void {
    const sourceNode = node.childForFieldName('source');
    if (!sourceNode) return;

    const module = code.substring(sourceNode.startIndex + 1, sourceNode.endIndex - 1); // Remove quotes
    const location: Location = {
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column
    };

    const importNode: ImportNode = {
      module,
      location,
      names: []
    };

    // Extract imported names
    for (const child of node.children) {
      if (child.type === 'import_clause') {
        for (const nameChild of child.children) {
          if (nameChild.type === 'identifier') {
            const name = code.substring(nameChild.startIndex, nameChild.endIndex);
            importNode.names.push({
              imported: name,
              local: name,
              type: 'default'
            });
          } else if (nameChild.type === 'named_imports') {
            for (const specifier of nameChild.children) {
              if (specifier.type === 'import_specifier') {
                const nameNode = specifier.childForFieldName('name');
                const aliasNode = specifier.childForFieldName('alias');
                if (nameNode) {
                  const imported = code.substring(nameNode.startIndex, nameNode.endIndex);
                  const local = aliasNode 
                    ? code.substring(aliasNode.startIndex, aliasNode.endIndex)
                    : imported;
                  importNode.names.push({
                    imported,
                    local,
                    type: 'named'
                  });
                }
              }
            }
          }
        }
      }
    }

    const imports = graph.imports.get(filePath) || [];
    graph.imports.set(filePath, importNode);
  }

  /**
   * Extract Python import statement
   */
  private extractPythonImport(
    node: Parser.SyntaxNode,
    code: string,
    filePath: string,
    graph: CodeGraph
  ): void {
    const location: Location = {
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column
    };

    if (node.type === 'import_statement') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const module = code.substring(nameNode.startIndex, nameNode.endIndex);
        const importNode: ImportNode = {
          module,
          location,
          names: [{
            imported: module,
            local: module,
            type: 'default'
          }]
        };
        graph.imports.set(filePath, importNode);
      }
    } else if (node.type === 'import_from_statement') {
      const moduleNode = node.childForFieldName('module_name');
      if (moduleNode) {
        const module = code.substring(moduleNode.startIndex, moduleNode.endIndex);
        const importNode: ImportNode = {
          module,
          location,
          names: []
        };

        // Extract names
        for (const child of node.children) {
          if (child.type === 'dotted_name' || child.type === 'identifier') {
            const name = code.substring(child.startIndex, child.endIndex);
            importNode.names.push({
              imported: name,
              local: name,
              type: 'named'
            });
          }
        }

        graph.imports.set(filePath, importNode);
      }
    }
  }

  /**
   * Extract export statement
   */
  private extractExport(
    node: Parser.SyntaxNode,
    code: string,
    filePath: string,
    graph: CodeGraph
  ): void {
    // Implementation for exports
    const location: Location = {
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column
    };

    // Handle various export types
    for (const child of node.children) {
      if (child.type === 'function_declaration' || child.type === 'class_declaration') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          const name = code.substring(nameNode.startIndex, nameNode.endIndex);
          const exportNode: ExportNode = {
            name,
            location,
            type: 'named'
          };
          
          const exports = graph.exports.get(filePath) || [];
          exports.push(exportNode);
          graph.exports.set(filePath, exports);
        }
      }
    }
  }

  /**
   * Extract call expression for call graph
   */
  private extractCallExpression(
    node: Parser.SyntaxNode,
    code: string,
    graph: CodeGraph,
    scope: Scope
  ): void {
    const functionNode = node.childForFieldName('function');
    if (functionNode) {
      const calleeName = code.substring(functionNode.startIndex, functionNode.endIndex);
      
      // Add to call graph
      const callerName = scope.name;
      const callees = graph.callGraph.get(callerName) || [];
      if (!callees.includes(calleeName)) {
        callees.push(calleeName);
        graph.callGraph.set(callerName, callees);
      }
    }
  }

  /**
   * Extract Python call expression
   */
  private extractPythonCallExpression(
    node: Parser.SyntaxNode,
    code: string,
    graph: CodeGraph,
    scope: Scope
  ): void {
    const functionNode = node.childForFieldName('function');
    if (functionNode) {
      const calleeName = code.substring(functionNode.startIndex, functionNode.endIndex);
      
      const callerName = scope.name;
      const callees = graph.callGraph.get(callerName) || [];
      if (!callees.includes(calleeName)) {
        callees.push(calleeName);
        graph.callGraph.set(callerName, callees);
      }
    }
  }

  /**
   * Add symbol to graph
   */
  private addSymbol(
    graph: CodeGraph,
    symbol: SymbolNode,
    scope: Scope,
    filePath: string
  ): void {
    const qualifiedName = scope.type === 'global' 
      ? symbol.name 
      : `${scope.name}.${symbol.name}`;
    
    graph.symbols.set(qualifiedName, symbol);
    scope.symbols.set(symbol.name, symbol);

    // Track file symbols
    const fileSymbols = graph.fileSymbols.get(filePath) || new Set();
    fileSymbols.add(qualifiedName);
    graph.fileSymbols.set(filePath, fileSymbols);
  }

  /**
   * Create empty CodeGraph
   */
  private createEmptyGraph(): CodeGraph {
    return {
      symbols: new Map(),
      references: new Map(),
      imports: new Map(),
      exports: new Map(),
      callGraph: new Map(),
      typeGraph: new Map(),
      scopes: new Map(),
      globalScope: {
        name: 'global',
        type: 'global',
        symbols: new Map(),
        children: []
      },
      dependencies: [],
      fileSymbols: new Map(),
      fileHashes: new Map(),
      lastUpdated: new Date(),
      version: '1.0.0'
    };
  }

  /**
   * Compute file hash for change detection
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
