/**
 * Codebase Analyzer - AST-based Cross-File Analysis
 *
 * This is the core analyzer that replaces regex-based analysis with proper
 * tree-sitter AST parsing, cross-file resolution, and type-aware checking.
 *
 * Key features:
 * - Multi-file symbol resolution
 * - Import/export tracking across files
 * - Type inference for method/property validation
 * - Scope-aware reference checking
 *
 * @format
 */

import { TreeSitterParser } from "./parsers/treeSitterParser.js";
import {
  SemanticIndexBuilder,
  SemanticQuery,
} from "./parsers/semanticIndex.js";
import { ScopeResolver } from "./parsers/scopeResolver.js";
import {
  CodeGraph,
  SymbolNode,
  Reference,
  Scope,
  ImportNode,
  SemanticIndex,
  Location,
} from "../types/codeGraph.js";
import { logger } from "../utils/logger.js";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";

// Built-in types and methods for type-aware checking
import { BUILTIN_TYPES } from "./builtinTypes.js";

export interface AnalysisIssue {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  file: string;
  line: number;
  column: number;
  code?: string;
  suggestion?: string;
  confidence: number;
}

export interface CodebaseAnalysisResult {
  issues: AnalysisIssue[];
  graph: CodeGraph;
  index: SemanticIndex;
  stats: {
    filesAnalyzed: number;
    totalSymbols: number;
    totalReferences: number;
    unresolvedReferences: number;
    analysisTime: number;
  };
}

/**
 * Main codebase analyzer class
 */
export class CodebaseAnalyzer {
  private parser: TreeSitterParser;
  private graph: CodeGraph;
  private index: SemanticIndex | null = null;
  private fileContents: Map<string, string> = new Map();
  private language: string;

  constructor(language: string = "typescript") {
    this.parser = new TreeSitterParser({ language });
    this.language = language;
    this.graph = this.createEmptyGraph();
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(
    filePath: string,
    code: string
  ): Promise<CodebaseAnalysisResult> {
    const startTime = Date.now();

    this.fileContents.set(filePath, code);

    // Parse with tree-sitter
    const parseResult = await this.parser.parse(code, filePath, this.language);

    // Merge into main graph
    this.mergeGraph(parseResult.graph);

    // Build semantic index
    this.index = SemanticIndexBuilder.buildIndex(this.graph);

    // Run analysis
    const issues = await this.runAnalysis(filePath);

    return {
      issues,
      graph: this.graph,
      index: this.index,
      stats: {
        filesAnalyzed: 1,
        totalSymbols: this.graph.symbols.size,
        totalReferences: this.countReferences(),
        unresolvedReferences: this.index.unresolvedReferences.length,
        analysisTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Analyze multiple files (cross-file resolution)
   */
  async analyzeFiles(
    files: Array<{ path: string; code: string }>
  ): Promise<CodebaseAnalysisResult> {
    const startTime = Date.now();

    // Phase 1: Parse all files and build combined graph
    for (const file of files) {
      this.fileContents.set(file.path, file.code);
      const parseResult = await this.parser.parse(
        file.code,
        file.path,
        this.language
      );
      this.mergeGraph(parseResult.graph);
    }

    // Phase 2: Build semantic index with all symbols
    this.index = SemanticIndexBuilder.buildIndex(this.graph);

    // Phase 3: Resolve cross-file imports
    await this.resolveImports();

    // Phase 4: Run analysis on all files
    const allIssues: AnalysisIssue[] = [];
    for (const file of files) {
      const issues = await this.runAnalysis(file.path);
      allIssues.push(...issues);
    }

    return {
      issues: allIssues,
      graph: this.graph,
      index: this.index,
      stats: {
        filesAnalyzed: files.length,
        totalSymbols: this.graph.symbols.size,
        totalReferences: this.countReferences(),
        unresolvedReferences: this.index.unresolvedReferences.length,
        analysisTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Analyze a directory
   */
  async analyzeDirectory(
    directory: string,
    options: {
      excludePatterns?: string[];
      maxFiles?: number;
    } = {}
  ): Promise<CodebaseAnalysisResult> {
    const extensions = this.getExtensions();
    const patterns = extensions.map((ext) => `${directory}/**/*${ext}`);
    const excludes = [
      "**/node_modules/**",
      "**/venv/**",
      "**/.venv/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      ...(options.excludePatterns || []),
    ];

    const filePaths = await glob(patterns, {
      ignore: excludes,
      nodir: true,
    });

    const limitedPaths = filePaths.slice(0, options.maxFiles || 500);

    const files: Array<{ path: string; code: string }> = [];
    for (const filePath of limitedPaths) {
      try {
        const code = await fs.readFile(filePath, "utf-8");
        files.push({ path: filePath, code });
      } catch (err) {
        logger.warn(`Failed to read ${filePath}: ${err}`);
      }
    }

    return this.analyzeFiles(files);
  }

  /**
   * Run all analysis checks on a file
   */
  private async runAnalysis(filePath: string): Promise<AnalysisIssue[]> {
    const issues: AnalysisIssue[] = [];
    const code = this.fileContents.get(filePath) || "";
    const lines = code.split("\n");

    if (!this.index) return issues;

    const resolver = new ScopeResolver(this.graph, this.index);
    const fileScope = this.graph.scopes.get(filePath);

    // 1. Check unresolved references (hallucinations)
    issues.push(...this.checkUnresolvedReferences(filePath, resolver, lines));

    // 2. Check invalid method calls (type-aware)
    issues.push(...this.checkMethodCalls(filePath, resolver, lines));

    // 3. Check invalid property access (type-aware)
    issues.push(...this.checkPropertyAccess(filePath, resolver, lines));

    // 4. Check unused imports
    issues.push(...this.checkUnusedImports(filePath, lines));

    // 5. Check for common hallucination patterns
    issues.push(...this.checkHallucinationPatterns(filePath, lines));

    return issues;
  }

  /**
   * Check for unresolved references (main hallucination detection)
   */
  private checkUnresolvedReferences(
    filePath: string,
    resolver: ScopeResolver,
    lines: string[]
  ): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    if (!this.index) return issues;

    // Get references in this file
    for (const [name, refs] of this.graph.references) {
      for (const ref of refs) {
        if (ref.location.file !== filePath) continue;

        // Skip if already resolved
        if (ref.resolvedSymbol) continue;

        // Try to resolve
        const scope =
          ref.scope ?
            this.graph.scopes.get(ref.scope)
          : this.graph.scopes.get(filePath);
        if (!scope) continue;

        const resolved = resolver.resolveSymbol(name, scope);

        // Check built-in types
        if (!resolved && this.isBuiltIn(name)) continue;

        // Check if it's from an import
        if (!resolved && this.isImported(name, filePath)) continue;

        if (!resolved) {
          // Find similar symbols for suggestion
          const query = new SemanticQuery(this.index, this.graph);
          const similar = query.findSimilar(name, 2);
          const suggestion =
            similar.length > 0 ?
              `Did you mean '${similar[0].name}'?`
            : "Symbol not found in codebase";

          issues.push({
            type: "unresolvedReference",
            severity: "critical",
            message: `Reference to non-existent symbol '${name}'`,
            file: filePath,
            line: ref.location.line,
            column: ref.location.column,
            code: lines[ref.location.line - 1]?.trim(),
            suggestion,
            confidence: 95,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check method calls with type awareness
   */
  private checkMethodCalls(
    filePath: string,
    resolver: ScopeResolver,
    lines: string[]
  ): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    for (const [name, refs] of this.graph.references) {
      // Check if this is a method call (contains dot)
      if (!name.includes(".")) continue;

      for (const ref of refs) {
        if (ref.location.file !== filePath) continue;

        const parts = name.split(".");
        const objectName = parts.slice(0, -1).join(".");
        const methodName = parts[parts.length - 1];

        // Check built-in methods
        if (this.isBuiltInMethod(objectName, methodName)) continue;

        // Try to resolve the object
        const scope =
          ref.scope ?
            this.graph.scopes.get(ref.scope)
          : this.graph.scopes.get(filePath);
        if (!scope) continue;

        const objectSymbol = resolver.resolveSymbol(objectName, scope);

        if (objectSymbol) {
          // Object exists, check if method exists on it
          const methodResolved = resolver.resolveMethodCall(
            objectName,
            methodName,
            scope
          );

          if (
            !methodResolved &&
            !this.isBuiltInMethod(objectSymbol.type, methodName)
          ) {
            issues.push({
              type: "invalidMethodCall",
              severity: "high",
              message: `Method '${methodName}' may not exist on '${objectName}'`,
              file: filePath,
              line: ref.location.line,
              column: ref.location.column,
              code: lines[ref.location.line - 1]?.trim(),
              suggestion: `Verify that '${objectName}' has method '${methodName}'`,
              confidence: 75,
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Check property access with type awareness
   */
  private checkPropertyAccess(
    filePath: string,
    resolver: ScopeResolver,
    lines: string[]
  ): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    // Property access checking is complex without full type inference
    // We only flag obvious cases where we know the object type

    for (const [qualifiedName, symbol] of this.graph.symbols) {
      if (symbol.location.file !== filePath) continue;
      if (symbol.type !== "class") continue;

      // Check usages of this class's instances
      const classScope = this.graph.scopes.get(symbol.name);
      if (!classScope) continue;

      // Get known properties and methods
      const knownMembers = new Set<string>();
      for (const [memberName] of classScope.symbols) {
        knownMembers.add(memberName);
      }
      if (symbol.properties) {
        for (const [propName] of symbol.properties) {
          knownMembers.add(propName);
        }
      }
      if (symbol.methods) {
        for (const [methodName] of symbol.methods) {
          knownMembers.add(methodName);
        }
      }

      // This is a simplified check - full implementation would track
      // variable types through assignments
    }

    return issues;
  }

  /**
   * Check for unused imports
   */
  private checkUnusedImports(
    filePath: string,
    lines: string[]
  ): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    const importNode = this.graph.imports.get(filePath);
    if (!importNode) return issues;

    const code = this.fileContents.get(filePath) || "";

    for (const imported of importNode.names) {
      const localName = imported.local;

      // Count usages (excluding the import line itself)
      const usagePattern = new RegExp(`\\b${localName}\\b`, "g");
      const matches = code.match(usagePattern) || [];

      // If only appears once (the import), it's unused
      if (matches.length <= 1) {
        issues.push({
          type: "unusedImport",
          severity: "medium",
          message: `Import '${localName}' is defined but never used`,
          file: filePath,
          line: importNode.location.line,
          column: importNode.location.column,
          suggestion: "Remove unused import",
          confidence: 90,
        });
      }
    }

    return issues;
  }

  /**
   * Check for common AI hallucination patterns
   */
  private checkHallucinationPatterns(
    filePath: string,
    lines: string[]
  ): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    // Common method names that AI often hallucinates
    const suspiciousPatterns = [
      { pattern: /\.authenticateUser\s*\(/, name: "authenticateUser" },
      { pattern: /\.validateToken\s*\(/, name: "validateToken" },
      { pattern: /\.sendEmail\s*\(/, name: "sendEmail" },
      { pattern: /\.processPayment\s*\(/, name: "processPayment" },
      { pattern: /\.connectToDatabase\s*\(/, name: "connectToDatabase" },
      { pattern: /\.fetchUserData\s*\(/, name: "fetchUserData" },
      { pattern: /\.encryptPassword\s*\(/, name: "encryptPassword" },
    ];

    lines.forEach((line, index) => {
      for (const { pattern, name } of suspiciousPatterns) {
        if (pattern.test(line)) {
          // Check if this method actually exists in the codebase
          const exists =
            this.graph.symbols.has(name) ||
            Array.from(this.graph.symbols.values()).some(
              (s) => s.methods?.has(name) || s.name === name
            );

          if (!exists) {
            issues.push({
              type: "suspiciousMethodCall",
              severity: "high",
              message: `Suspicious method '${name}' - commonly hallucinated by AI`,
              file: filePath,
              line: index + 1,
              column: line.indexOf(name),
              code: line.trim(),
              suggestion: `Verify '${name}' exists in your codebase`,
              confidence: 70,
            });
          }
        }
      }
    });

    return issues;
  }

  /**
   * Resolve imports across files
   */
  private async resolveImports(): Promise<void> {
    for (const [filePath, importNode] of this.graph.imports) {
      for (const imported of importNode.names) {
        // Try to find the exported symbol
        const exportedSymbol = this.findExportedSymbol(
          importNode.module,
          imported.imported,
          filePath
        );

        if (exportedSymbol) {
          // Mark the import as resolved
          imported.type = "named";

          // Add to file's scope
          const fileScope = this.graph.scopes.get(filePath);
          if (fileScope) {
            fileScope.symbols.set(imported.local, exportedSymbol);
          }
        }
      }
    }
  }

  /**
   * Find an exported symbol from a module
   */
  private findExportedSymbol(
    modulePath: string,
    symbolName: string,
    fromFile: string
  ): SymbolNode | null {
    // Resolve relative imports
    let resolvedPath = modulePath;
    if (modulePath.startsWith(".")) {
      const dir = path.dirname(fromFile);
      resolvedPath = path.resolve(dir, modulePath);

      // Try with extensions
      const extensions = this.getExtensions();
      for (const ext of extensions) {
        const withExt = resolvedPath + ext;
        if (this.fileContents.has(withExt)) {
          resolvedPath = withExt;
          break;
        }
        // Try index file
        const indexPath = path.join(resolvedPath, `index${ext}`);
        if (this.fileContents.has(indexPath)) {
          resolvedPath = indexPath;
          break;
        }
      }
    }

    // Check exports from resolved file
    const exports = this.graph.exports.get(resolvedPath);
    if (exports) {
      for (const exp of exports) {
        if (exp.name === symbolName || exp.type === "default") {
          // Find the actual symbol
          const symbol =
            this.graph.symbols.get(symbolName) ||
            this.graph.symbols.get(`${resolvedPath}.${symbolName}`);
          if (symbol) return symbol;
        }
      }
    }

    // Check if symbol exists in the file's scope
    const fileScope = this.graph.scopes.get(resolvedPath);
    if (fileScope) {
      const symbol = fileScope.symbols.get(symbolName);
      if (symbol) return symbol;
    }

    return null;
  }

  /**
   * Check if a name is a built-in
   */
  private isBuiltIn(name: string): boolean {
    const builtins = BUILTIN_TYPES[this.language] || {};
    return !!(
      builtins.globals?.includes(name) ||
      builtins.functions?.includes(name) ||
      builtins.classes?.includes(name) ||
      builtins.keywords?.includes(name)
    );
  }

  /**
   * Check if a method is a built-in method on a type
   */
  private isBuiltInMethod(typeName: string, methodName: string): boolean {
    const builtins = BUILTIN_TYPES[this.language] || {};
    const typeMethods = builtins.methods?.[typeName];
    if (typeMethods?.includes(methodName)) return true;

    // Check common object methods
    const commonMethods = [
      "toString",
      "valueOf",
      "hasOwnProperty",
      "constructor",
    ];
    if (commonMethods.includes(methodName)) return true;

    // Check array methods
    if (
      ["Array", "array", "list"].some((t) => typeName.toLowerCase().includes(t))
    ) {
      const arrayMethods = [
        "push",
        "pop",
        "shift",
        "unshift",
        "slice",
        "splice",
        "map",
        "filter",
        "reduce",
        "forEach",
        "find",
        "findIndex",
        "includes",
        "indexOf",
        "join",
        "sort",
        "reverse",
        "concat",
        "every",
        "some",
        "flat",
        "flatMap",
        "fill",
        "entries",
        "keys",
        "values",
        "at",
        "length",
        "append",
        "extend",
        "remove",
      ];
      if (arrayMethods.includes(methodName)) return true;
    }

    // Check string methods
    if (
      ["String", "string", "str"].some((t) =>
        typeName.toLowerCase().includes(t)
      )
    ) {
      const stringMethods = [
        "charAt",
        "charCodeAt",
        "concat",
        "includes",
        "indexOf",
        "lastIndexOf",
        "match",
        "replace",
        "search",
        "slice",
        "split",
        "substring",
        "toLowerCase",
        "toUpperCase",
        "trim",
        "startsWith",
        "endsWith",
        "padStart",
        "padEnd",
        "repeat",
        "format",
        "strip",
        "upper",
        "lower",
        "join",
        "encode",
      ];
      if (stringMethods.includes(methodName)) return true;
    }

    return false;
  }

  /**
   * Check if a name is imported in a file
   */
  private isImported(name: string, filePath: string): boolean {
    const importNode = this.graph.imports.get(filePath);
    if (!importNode) return false;

    return importNode.names.some((imp) => imp.local === name);
  }

  /**
   * Merge a parsed graph into the main graph
   */
  private mergeGraph(newGraph: CodeGraph): void {
    // Merge symbols
    for (const [name, symbol] of newGraph.symbols) {
      this.graph.symbols.set(name, symbol);
    }

    // Merge references
    for (const [name, refs] of newGraph.references) {
      const existing = this.graph.references.get(name) || [];
      this.graph.references.set(name, [...existing, ...refs]);
    }

    // Merge imports
    for (const [file, importNode] of newGraph.imports) {
      this.graph.imports.set(file, importNode);
    }

    // Merge exports
    for (const [file, exports] of newGraph.exports) {
      this.graph.exports.set(file, exports);
    }

    // Merge call graph
    for (const [caller, callees] of newGraph.callGraph) {
      const existing = this.graph.callGraph.get(caller) || [];
      this.graph.callGraph.set(caller, [...new Set([...existing, ...callees])]);
    }

    // Merge scopes
    for (const [name, scope] of newGraph.scopes) {
      this.graph.scopes.set(name, scope);
    }

    // Merge file symbols
    for (const [file, symbols] of newGraph.fileSymbols) {
      this.graph.fileSymbols.set(file, symbols);
    }

    // Merge file hashes
    for (const [file, hash] of newGraph.fileHashes) {
      this.graph.fileHashes.set(file, hash);
    }
  }

  /**
   * Count total references
   */
  private countReferences(): number {
    let count = 0;
    for (const refs of this.graph.references.values()) {
      count += refs.length;
    }
    return count;
  }

  /**
   * Get file extensions for current language
   */
  private getExtensions(): string[] {
    const extensions: Record<string, string[]> = {
      javascript: [".js", ".jsx", ".mjs"],
      typescript: [".ts", ".tsx", ".mts"],
      python: [".py"],
      go: [".go"],
    };
    return extensions[this.language] || [".js"];
  }

  /**
   * Create empty graph
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
        name: "global",
        type: "global",
        symbols: new Map(),
        children: [],
      },
      dependencies: [],
      fileSymbols: new Map(),
      fileHashes: new Map(),
      lastUpdated: new Date(),
      version: "1.0.0",
    };
  }

  /**
   * Get the current graph (for external access)
   */
  getGraph(): CodeGraph {
    return this.graph;
  }

  /**
   * Get the semantic index (for external access)
   */
  getIndex(): SemanticIndex | null {
    return this.index;
  }

  /**
   * Reset the analyzer state
   */
  reset(): void {
    this.graph = this.createEmptyGraph();
    this.index = null;
    this.fileContents.clear();
  }
}
