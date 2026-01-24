/**
 * Semantic Index for O(1) Symbol Lookups
 *
 * Pre-computed indexes for fast symbol resolution and queries.
 * Enables instant lookups without traversing the entire graph.
 *
 * @format
 */

import {
  CodeGraph,
  SemanticIndex,
  SymbolNode,
  SymbolType,
  Reference,
  Scope,
} from "../../types/codeGraph.js";
import { logger } from "../../utils/logger.js";

export class SemanticIndexBuilder {
  /**
   * Build complete semantic index from CodeGraph
   */
  static buildIndex(graph: CodeGraph): SemanticIndex {
    const startTime = Date.now();

    const index: SemanticIndex = {
      symbolsByName: new Map(),
      symbolsByFile: new Map(),
      symbolsByType: new Map(),
      referencesTo: new Map(),
      referencesFrom: new Map(),
      unusedSymbols: new Set(),
      unresolvedReferences: [],
      typeIndex: new Map(graph.typeGraph),
      scopeIndex: new Map(graph.scopes),
    };

    // Index symbols by name
    for (const [qualifiedName, symbol] of graph.symbols) {
      // By name (non-unique)
      const nameSymbols = index.symbolsByName.get(symbol.name) || [];
      nameSymbols.push(symbol);
      index.symbolsByName.set(symbol.name, nameSymbols);

      // By file
      const fileSymbols = index.symbolsByFile.get(symbol.location.file) || [];
      fileSymbols.push(symbol);
      index.symbolsByFile.set(symbol.location.file, fileSymbols);

      // By type
      const typeSymbols = index.symbolsByType.get(symbol.type) || [];
      typeSymbols.push(symbol);
      index.symbolsByType.set(symbol.type, typeSymbols);

      // Track unused symbols (no usages)
      if (symbol.usages.length === 0 && !symbol.isExported) {
        index.unusedSymbols.add(qualifiedName);
      }
    }

    // Index references
    for (const [symbolName, references] of graph.references) {
      for (const ref of references) {
        // References TO this symbol
        const refsTo = index.referencesTo.get(symbolName) || [];
        refsTo.push(ref);
        index.referencesTo.set(symbolName, refsTo);

        // Check if reference resolves
        const resolved = this.resolveReference(ref, graph);
        if (!resolved) {
          index.unresolvedReferences.push(ref);
        } else {
          ref.resolvedSymbol = resolved.name;
        }

        // References FROM this location
        const scopeKey = `${ref.location.file}:${ref.location.line}`;
        const refsFrom = index.referencesFrom.get(scopeKey) || [];
        refsFrom.push(ref);
        index.referencesFrom.set(scopeKey, refsFrom);
      }
    }

    const buildTime = Date.now() - startTime;
    logger.debug(`Built semantic index in ${buildTime}ms`);
    logger.debug(`  - ${index.symbolsByName.size} unique symbol names`);
    logger.debug(`  - ${index.unusedSymbols.size} unused symbols`);
    logger.debug(
      `  - ${index.unresolvedReferences.length} unresolved references`,
    );

    return index;
  }

  /**
   * Update index incrementally (for changed files)
   */
  static updateIndex(
    index: SemanticIndex,
    graph: CodeGraph,
    changedFiles: string[],
  ): SemanticIndex {
    const startTime = Date.now();

    // Remove symbols from changed files
    for (const file of changedFiles) {
      const fileSymbols = index.symbolsByFile.get(file) || [];

      for (const symbol of fileSymbols) {
        // Remove from name index
        const nameSymbols = index.symbolsByName.get(symbol.name) || [];
        const filtered = nameSymbols.filter((s) => s.location.file !== file);
        if (filtered.length > 0) {
          index.symbolsByName.set(symbol.name, filtered);
        } else {
          index.symbolsByName.delete(symbol.name);
        }

        // Remove from type index
        const typeSymbols = index.symbolsByType.get(symbol.type) || [];
        const filteredType = typeSymbols.filter(
          (s) => s.location.file !== file,
        );
        if (filteredType.length > 0) {
          index.symbolsByType.set(symbol.type, filteredType);
        } else {
          index.symbolsByType.delete(symbol.type);
        }

        // Remove from unused if present
        const qualifiedName = `${symbol.definedIn}.${symbol.name}`;
        index.unusedSymbols.delete(qualifiedName);
      }

      // Clear file entry
      index.symbolsByFile.delete(file);
    }

    // Re-add symbols from updated graph for changed files
    for (const file of changedFiles) {
      const fileSymbolNames = graph.fileSymbols.get(file);
      if (!fileSymbolNames) continue;

      for (const qualifiedName of fileSymbolNames) {
        const symbol = graph.symbols.get(qualifiedName);
        if (!symbol) continue;

        // Re-index symbol
        const nameSymbols = index.symbolsByName.get(symbol.name) || [];
        nameSymbols.push(symbol);
        index.symbolsByName.set(symbol.name, nameSymbols);

        const fileSymbols = index.symbolsByFile.get(file) || [];
        fileSymbols.push(symbol);
        index.symbolsByFile.set(file, fileSymbols);

        const typeSymbols = index.symbolsByType.get(symbol.type) || [];
        typeSymbols.push(symbol);
        index.symbolsByType.set(symbol.type, typeSymbols);

        if (symbol.usages.length === 0 && !symbol.isExported) {
          index.unusedSymbols.add(qualifiedName);
        }
      }
    }

    // Update unresolved references
    index.unresolvedReferences = [];
    for (const references of graph.references.values()) {
      for (const ref of references) {
        const resolved = this.resolveReference(ref, graph);
        if (!resolved) {
          index.unresolvedReferences.push(ref);
        }
      }
    }

    const updateTime = Date.now() - startTime;
    logger.debug(
      `Updated semantic index in ${updateTime}ms for ${changedFiles.length} files`,
    );

    return index;
  }

  /**
   * Find symbol by name with scope resolution
   */
  static findSymbol(
    name: string,
    index: SemanticIndex,
    scope?: string,
    file?: string,
  ): SymbolNode | null {
    const candidates = index.symbolsByName.get(name);
    if (!candidates || candidates.length === 0) return null;

    // If only one candidate, return it
    if (candidates.length === 1) return candidates[0];

    // Filter by file if provided
    if (file) {
      const inFile = candidates.filter((s) => s.location.file === file);
      if (inFile.length === 1) return inFile[0];
      if (inFile.length > 1) {
        // Prefer closer scope
        if (scope) {
          const inScope = inFile.find((s) => s.definedIn === scope);
          if (inScope) return inScope;
        }
        return inFile[0]; // Return first match
      }
    }

    // Filter by scope if provided
    if (scope) {
      const inScope = candidates.find((s) => s.definedIn === scope);
      if (inScope) return inScope;
    }

    // Return first candidate as fallback
    return candidates[0];
  }

  /**
   * Find all references to a symbol
   */
  static findReferences(name: string, index: SemanticIndex): Reference[] {
    return index.referencesTo.get(name) || [];
  }

  /**
   * Find unused symbols
   */
  static findUnusedSymbols(index: SemanticIndex): SymbolNode[] {
    const unused: SymbolNode[] = [];

    for (const symbols of index.symbolsByName.values()) {
      for (const symbol of symbols) {
        const qualifiedName = `${symbol.definedIn}.${symbol.name}`;
        if (index.unusedSymbols.has(qualifiedName)) {
          unused.push(symbol);
        }
      }
    }

    return unused;
  }

  /**
   * Find symbols by type
   */
  static findSymbolsByType(
    type: SymbolType,
    index: SemanticIndex,
  ): SymbolNode[] {
    return index.symbolsByType.get(type) || [];
  }

  /**
   * Find symbols in file
   */
  static findSymbolsInFile(file: string, index: SemanticIndex): SymbolNode[] {
    return index.symbolsByFile.get(file) || [];
  }

  /**
   * Check if symbol exists
   */
  static symbolExists(name: string, index: SemanticIndex): boolean {
    return (
      index.symbolsByName.has(name) &&
      (index.symbolsByName.get(name)?.length || 0) > 0
    );
  }

  /**
   * Get symbol statistics
   */
  static getStatistics(index: SemanticIndex): {
    totalSymbols: number;
    symbolsByType: Record<SymbolType, number>;
    unusedCount: number;
    unresolvedCount: number;
  } {
    let totalSymbols = 0;
    const symbolsByType: Record<string, number> = {};

    for (const [type, symbols] of index.symbolsByType) {
      symbolsByType[type] = symbols.length;
      totalSymbols += symbols.length;
    }

    return {
      totalSymbols,
      symbolsByType: symbolsByType as Record<SymbolType, number>,
      unusedCount: index.unusedSymbols.size,
      unresolvedCount: index.unresolvedReferences.length,
    };
  }

  /**
   * Resolve reference to its symbol definition
   */
  private static resolveReference(
    ref: Reference,
    graph: CodeGraph,
  ): SymbolNode | null {
    // Try exact match first
    if (graph.symbols.has(ref.name)) {
      return graph.symbols.get(ref.name) || null;
    }

    // Try scope-qualified match
    if (ref.scope) {
      const qualifiedName = `${ref.scope}.${ref.name}`;
      if (graph.symbols.has(qualifiedName)) {
        return graph.symbols.get(qualifiedName) || null;
      }
    }

    // Try to resolve through scopes
    const scope = ref.scope ? graph.scopes.get(ref.scope) : null;
    if (scope) {
      const resolved = this.resolveInScope(ref.name, scope, graph);
      if (resolved) return resolved;
    }

    // Check imports
    const imports = graph.imports.get(ref.location.file);
    if (imports) {
      for (const importName of imports.names) {
        if (importName.local === ref.name) {
          // Symbol is imported, consider it resolved
          return {
            name: ref.name,
            type: "variable", // We don't know the exact type
            location: imports.location,
            usages: [],
            definedIn: "external",
          };
        }
      }
    }

    return null;
  }

  /**
   * Resolve symbol in scope hierarchy
   */
  private static resolveInScope(
    name: string,
    scope: Scope,
    graph: CodeGraph,
  ): SymbolNode | null {
    // Check current scope
    if (scope.symbols.has(name)) {
      return scope.symbols.get(name) || null;
    }

    // Check parent scopes
    if (scope.parent) {
      return this.resolveInScope(name, scope.parent, graph);
    }

    return null;
  }
}

/**
 * Query helper for semantic index
 */
export class SemanticQuery {
  constructor(
    private index: SemanticIndex,
    private graph: CodeGraph,
  ) {}

  /**
   * Find symbol with context
   */
  findSymbol(
    name: string,
    context?: { file?: string; scope?: string },
  ): SymbolNode | null {
    return SemanticIndexBuilder.findSymbol(
      name,
      this.index,
      context?.scope,
      context?.file,
    );
  }

  /**
   * Find all usages of a symbol
   */
  findUsages(symbolName: string): Reference[] {
    return SemanticIndexBuilder.findReferences(symbolName, this.index);
  }

  /**
   * Check if reference is valid
   */
  isValidReference(ref: Reference): boolean {
    const resolved = SemanticIndexBuilder.findSymbol(
      ref.name,
      this.index,
      ref.scope,
      ref.location.file,
    );
    return resolved !== null;
  }

  /**
   * Find dead code (unused and not exported)
   */
  findDeadCode(): SymbolNode[] {
    return SemanticIndexBuilder.findUnusedSymbols(this.index);
  }

  /**
   * Find all functions that call a given function
   */
  findCallers(functionName: string): string[] {
    const callers: string[] = [];

    for (const [caller, callees] of this.graph.callGraph) {
      if (callees.includes(functionName)) {
        callers.push(caller);
      }
    }

    return callers;
  }

  /**
   * Find all functions called by a given function
   */
  findCallees(functionName: string): string[] {
    return this.graph.callGraph.get(functionName) || [];
  }

  /**
   * Find symbols matching pattern
   */
  findByPattern(pattern: RegExp, type?: SymbolType): SymbolNode[] {
    const results: SymbolNode[] = [];
    const symbols =
      type ?
        this.index.symbolsByType.get(type) || []
      : Array.from(this.index.symbolsByName.values()).flat();

    for (const symbol of symbols) {
      if (pattern.test(symbol.name)) {
        results.push(symbol);
      }
    }

    return results;
  }

  /**
   * Get symbol with all its relationships
   */
  getSymbolWithRelationships(name: string): {
    symbol: SymbolNode | null;
    usages: Reference[];
    callers: string[];
    callees: string[];
    scope: Scope | null;
  } {
    const symbol = this.findSymbol(name);

    return {
      symbol,
      usages: symbol ? this.findUsages(name) : [],
      callers:
        symbol && symbol.type === "function" ? this.findCallers(name) : [],
      callees:
        symbol && symbol.type === "function" ? this.findCallees(name) : [],
      scope:
        symbol?.definedIn ?
          this.graph.scopes.get(symbol.definedIn) || null
        : null,
    };
  }

  /**
   * Find similar symbol names (for suggestions)
   */
  findSimilar(name: string, maxDistance: number = 3): SymbolNode[] {
    const results: SymbolNode[] = [];

    for (const [symbolName, symbols] of this.index.symbolsByName) {
      const distance = this.levenshteinDistance(name, symbolName);
      if (distance <= maxDistance) {
        results.push(...symbols);
      }
    }

    // Sort by similarity
    results.sort((a, b) => {
      const distA = this.levenshteinDistance(name, a.name);
      const distB = this.levenshteinDistance(name, b.name);
      return distA - distB;
    });

    return results;
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1, // deletion
            dp[i][j - 1] + 1, // insertion
            dp[i - 1][j - 1] + 1, // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Get index statistics
   */
  getStatistics() {
    return SemanticIndexBuilder.getStatistics(this.index);
  }
}
