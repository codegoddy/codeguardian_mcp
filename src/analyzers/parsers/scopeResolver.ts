/**
 * Context-Aware Scope Resolution
 *
 * Accurately resolves symbols considering scope hierarchy, imports, and context.
 * Critical for detecting hallucinations in AI-generated code.
 *
 * @format
 */

import {
  CodeGraph,
  SymbolNode,
  Reference,
  Scope,
  SemanticIndex,
} from "../../types/codeGraph.js";
import { logger } from "../../utils/logger.js";

export class ScopeResolver {
  constructor(
    private graph: CodeGraph,
    private index?: SemanticIndex,
  ) {}

  /**
   * Resolve symbol in given scope with full context awareness
   */
  resolveSymbol(name: string, currentScope: Scope): SymbolNode | null {
    // 1. Check local scope first
    let scope: Scope | undefined = currentScope;
    while (scope) {
      const symbol = scope.symbols.get(name);
      if (symbol) {
        logger.debug(`Resolved '${name}' in scope '${scope.name}'`);
        return symbol;
      }
      scope = scope.parent;
    }

    // 2. Check imports in current file
    if (currentScope.location) {
      const imported = this.resolveImport(name, currentScope.location.file);
      if (imported) {
        logger.debug(`Resolved '${name}' from imports`);
        return imported;
      }
    }

    // 3. Check global scope
    const globalSymbol = this.graph.globalScope.symbols.get(name);
    if (globalSymbol) {
      logger.debug(`Resolved '${name}' in global scope`);
      return globalSymbol;
    }

    logger.debug(`Could not resolve '${name}'`);
    return null; // Symbol doesn't exist - HALLUCINATION!
  }

  /**
   * Resolve method call on an object
   */
  resolveMethodCall(
    objectName: string,
    methodName: string,
    scope: Scope,
  ): SymbolNode | null {
    // 1. Resolve the object
    const objectSymbol = this.resolveSymbol(objectName, scope);
    if (!objectSymbol) {
      logger.debug(`Object '${objectName}' not found`);
      return null;
    }

    // 2. Get object's type
    const type = this.getSymbolType(objectSymbol);
    if (!type) {
      logger.debug(`Could not determine type of '${objectName}'`);
      return null;
    }

    // 3. Check if type has this method
    if (objectSymbol.methods && objectSymbol.methods.has(methodName)) {
      const method = objectSymbol.methods.get(methodName);
      logger.debug(`Resolved method '${methodName}' on '${objectName}'`);
      return method || null;
    }

    // 4. Check class definition for methods
    if (objectSymbol.type === "class") {
      // Look for method in class scope
      const classScope = this.findScopeByName(objectSymbol.name);
      if (classScope) {
        const method = classScope.symbols.get(methodName);
        if (method && method.type === "method") {
          logger.debug(
            `Resolved method '${methodName}' in class '${objectName}'`,
          );
          return method;
        }
      }
    }

    logger.debug(`Method '${methodName}' not found on '${objectName}'`);
    return null; // Method doesn't exist - HALLUCINATION!
  }

  /**
   * Resolve property access
   */
  resolvePropertyAccess(
    objectName: string,
    propertyName: string,
    scope: Scope,
  ): SymbolNode | null {
    const objectSymbol = this.resolveSymbol(objectName, scope);
    if (!objectSymbol) return null;

    // Check properties
    if (objectSymbol.properties && objectSymbol.properties.has(propertyName)) {
      return objectSymbol.properties.get(propertyName) || null;
    }

    // Check class fields
    if (objectSymbol.type === "class") {
      const classScope = this.findScopeByName(objectSymbol.name);
      if (classScope) {
        const property = classScope.symbols.get(propertyName);
        if (property && property.type === "property") {
          return property;
        }
      }
    }

    return null;
  }

  /**
   * Resolve import
   */
  private resolveImport(name: string, filePath: string): SymbolNode | null {
    const importNode = this.graph.imports.get(filePath);
    if (!importNode) return null;

    // Check if name is imported
    for (const imported of importNode.names) {
      if (imported.local === name) {
        // Create symbol for imported name
        return {
          name: imported.local,
          type: "variable", // Could be function, class, etc.
          location: importNode.location,
          usages: [],
          definedIn: "external",
          documentation: `Imported from ${importNode.module}`,
        };
      }
    }

    return null;
  }

  /**
   * Get symbol type information
   */
  private getSymbolType(symbol: SymbolNode): string | null {
    // If symbol has explicit type
    if (symbol.returnType) {
      return symbol.returnType;
    }

    // Use symbol's declared type
    return symbol.type;
  }

  /**
   * Find scope by name
   */
  private findScopeByName(name: string): Scope | null {
    for (const scope of this.graph.scopes.values()) {
      if (scope.name === name) {
        return scope;
      }
    }
    return null;
  }

  /**
   * Resolve all references in a scope
   */
  resolveAllReferences(scope: Scope): Map<Reference, SymbolNode | null> {
    const resolutions = new Map<Reference, SymbolNode | null>();

    for (const refs of this.graph.references.values()) {
      for (const ref of refs) {
        if (ref.scope === scope.name) {
          const resolved = this.resolveSymbol(ref.name, scope);
          resolutions.set(ref, resolved);
        }
      }
    }

    return resolutions;
  }

  /**
   * Check if a reference is valid in given scope
   */
  isValidReference(ref: Reference, scope: Scope): boolean {
    const resolved = this.resolveSymbol(ref.name, scope);
    return resolved !== null;
  }

  /**
   * Find unresolved references in scope
   */
  findUnresolvedReferences(scope: Scope): Reference[] {
    const unresolved: Reference[] = [];

    for (const refs of this.graph.references.values()) {
      for (const ref of refs) {
        if (ref.scope === scope.name) {
          const resolved = this.resolveSymbol(ref.name, scope);
          if (!resolved) {
            unresolved.push(ref);
          }
        }
      }
    }

    return unresolved;
  }

  /**
   * Get scope chain (for debugging)
   */
  getScopeChain(scope: Scope): string[] {
    const chain: string[] = [];
    let current: Scope | undefined = scope;

    while (current) {
      chain.unshift(current.name);
      current = current.parent;
    }

    return chain;
  }

  /**
   * Find symbol with full qualification
   */
  resolveQualifiedName(qualifiedName: string, scope: Scope): SymbolNode | null {
    const parts = qualifiedName.split(".");

    if (parts.length === 1) {
      return this.resolveSymbol(qualifiedName, scope);
    }

    // Resolve first part
    let current = this.resolveSymbol(parts[0], scope);
    if (!current) return null;

    // Resolve remaining parts
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];

      // Check if it's a method
      if (current.methods && current.methods.has(part)) {
        current = current.methods.get(part) || null;
        if (!current) return null;
      }
      // Check if it's a property
      else if (current.properties && current.properties.has(part)) {
        current = current.properties.get(part) || null;
        if (!current) return null;
      }
      // Try to find in class scope
      else if (current.type === "class") {
        const classScope = this.findScopeByName(current.name);
        if (classScope) {
          current = classScope.symbols.get(part) || null;
          if (!current) return null;
        } else {
          return null;
        }
      } else {
        return null;
      }
    }

    return current;
  }
}

/**
 * Scope analysis utilities
 */
export class ScopeAnalyzer {
  /**
   * Analyze scope complexity
   */
  static analyzeScopeComplexity(scope: Scope): {
    depth: number;
    symbolCount: number;
    childCount: number;
    totalDescendants: number;
  } {
    const depth = this.getScopeDepth(scope);
    const symbolCount = scope.symbols.size;
    const childCount = scope.children.length;
    const totalDescendants = this.countDescendants(scope);

    return { depth, symbolCount, childCount, totalDescendants };
  }

  /**
   * Get scope depth in hierarchy
   */
  private static getScopeDepth(scope: Scope): number {
    let depth = 0;
    let current: Scope | undefined = scope;

    while (current.parent) {
      depth++;
      current = current.parent;
    }

    return depth;
  }

  /**
   * Count all descendant scopes
   */
  private static countDescendants(scope: Scope): number {
    let count = scope.children.length;

    for (const child of scope.children) {
      count += this.countDescendants(child);
    }

    return count;
  }

  /**
   * Find all symbols in scope and descendants
   */
  static getAllSymbols(scope: Scope): SymbolNode[] {
    const symbols: SymbolNode[] = Array.from(scope.symbols.values());

    for (const child of scope.children) {
      symbols.push(...this.getAllSymbols(child));
    }

    return symbols;
  }

  /**
   * Check for shadowed variables
   */
  static findShadowedSymbols(scope: Scope): Array<{
    symbol: SymbolNode;
    shadowedBy: SymbolNode;
  }> {
    const shadowed: Array<{ symbol: SymbolNode; shadowedBy: SymbolNode }> = [];

    // Check each symbol in this scope
    for (const [name, symbol] of scope.symbols) {
      // Check if parent scopes have same name
      let parent = scope.parent;
      while (parent) {
        const parentSymbol = parent.symbols.get(name);
        if (parentSymbol) {
          shadowed.push({
            symbol: parentSymbol,
            shadowedBy: symbol,
          });
          break;
        }
        parent = parent.parent;
      }
    }

    // Recursively check children
    for (const child of scope.children) {
      shadowed.push(...this.findShadowedSymbols(child));
    }

    return shadowed;
  }
}
