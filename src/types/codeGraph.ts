/**
 * Code Graph - Enhanced Symbol Table with Relationships
 * 
 * This is the core data structure for accurate hallucination detection.
 * Unlike a simple symbol table, it tracks relationships between symbols,
 * enabling O(1) lookups and context-aware validation.
 */

export interface Location {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface Reference {
  name: string;
  location: Location;
  type: 'usage' | 'definition' | 'import' | 'export';
  scope?: string;
  resolvedSymbol?: string; // Fully qualified name of the symbol this references
}

export type SymbolType = 'function' | 'class' | 'variable' | 'type' | 'interface' | 'method' | 'property' | 'parameter' | 'module';

export interface SymbolNode {
  name: string;
  type: SymbolType;
  location: Location;
  signature?: string; // For functions: "(param1: type1, param2: type2) => returnType"
  usages: Reference[]; // Where this symbol is used
  definedIn?: string; // Scope/module (e.g., "MyClass" or "global")
  parameters?: string[]; // For functions
  returnType?: string; // For functions
  properties?: Map<string, SymbolNode>; // For classes/objects
  methods?: Map<string, SymbolNode>; // For classes
  isExported?: boolean;
  isAsync?: boolean;
  visibility?: 'public' | 'private' | 'protected';
  documentation?: string; // JSDoc or docstring
}

export interface ImportNode {
  module: string;
  location: Location;
  names: Array<{
    imported: string; // Original name in module
    local: string; // Local name (alias)
    type: 'named' | 'default' | 'namespace';
  }>;
  isTypeOnly?: boolean; // TypeScript type-only imports
}

export interface ExportNode {
  name: string;
  location: Location;
  type: 'named' | 'default';
  source?: string; // Re-export from another module
}

export interface Scope {
  name: string;
  type: 'global' | 'function' | 'class' | 'block' | 'module';
  parent?: Scope;
  symbols: Map<string, SymbolNode>;
  children: Scope[];
  location?: Location;
}

export interface TypeInfo {
  name: string;
  kind: 'primitive' | 'object' | 'array' | 'function' | 'union' | 'intersection' | 'generic' | 'unknown';
  baseType?: string; // For arrays: element type, for generics: base type
  properties?: Map<string, TypeInfo>; // For objects
  parameters?: TypeInfo[]; // For functions
  returnType?: TypeInfo; // For functions
  typeArguments?: TypeInfo[]; // For generics
  unionTypes?: TypeInfo[]; // For union types
}

export interface DependencyEdge {
  from: string; // Symbol name
  to: string; // Symbol name
  type: 'calls' | 'uses' | 'extends' | 'implements' | 'imports';
  location: Location;
}

export interface CodeGraph {
  // Primary symbol storage
  symbols: Map<string, SymbolNode>; // key: fully qualified name
  
  // Reference tracking
  references: Map<string, Reference[]>; // key: symbol name, value: all references
  
  // Import/Export tracking
  imports: Map<string, ImportNode>; // key: file path
  exports: Map<string, ExportNode[]>; // key: file path
  
  // Call graph for function relationships
  callGraph: Map<string, string[]>; // key: function name, value: functions it calls
  
  // Type information
  typeGraph: Map<string, TypeInfo>; // key: type name
  
  // Scope tree for resolution
  scopes: Map<string, Scope>; // key: scope id (file:line:col or similar)
  globalScope: Scope;
  
  // Dependency graph
  dependencies: DependencyEdge[];
  
  // File-based indexing for incremental updates
  fileSymbols: Map<string, Set<string>>; // key: file path, value: symbol names
  fileHashes: Map<string, string>; // For change detection
  
  // Metadata
  lastUpdated: Date;
  version: string;
}

export interface SemanticIndex {
  // Fast lookups
  symbolsByName: Map<string, SymbolNode[]>; // Non-unique names
  symbolsByFile: Map<string, SymbolNode[]>;
  symbolsByType: Map<SymbolType, SymbolNode[]>;
  
  // Reference tracking (reverse indexes)
  referencesTo: Map<string, Reference[]>; // Who references this symbol
  referencesFrom: Map<string, Reference[]>; // What this symbol references
  
  // Quick queries
  unusedSymbols: Set<string>; // Symbols with no usages
  unresolvedReferences: Reference[]; // References that don't resolve
  
  // Type index
  typeIndex: Map<string, TypeInfo>;
  
  // Scope index for fast resolution
  scopeIndex: Map<string, Scope>;
}

export interface AnalysisChunk {
  lines: [number, number]; // Start and end lines
  symbols: SymbolNode[];
  issues: Array<{
    type: string;
    message: string;
    location: Location;
    severity: 'error' | 'warning' | 'info';
  }>;
}

export interface SessionDiff {
  added: SymbolNode[];
  removed: SymbolNode[];
  modified: Array<{
    before: SymbolNode;
    after: SymbolNode;
  }>;
  
  // Critical for hallucination detection
  newReferences: Reference[];
  brokenReferences: Reference[]; // References that no longer resolve
  
  // Changes in dependencies
  addedDependencies: DependencyEdge[];
  removedDependencies: DependencyEdge[];
}

export interface ParseResult {
  graph: CodeGraph;
  errors: Array<{
    message: string;
    location: Location;
    severity: 'error' | 'warning';
  }>;
  parseTime: number; // milliseconds
}

export interface CodebaseMetrics {
  // Pre-computed at parse time
  totalFunctions: number;
  totalClasses: number;
  totalFiles: number;
  linesOfCode: number;
  
  // Complexity metrics
  complexity: Map<string, number>; // function -> complexity score
  maintainabilityIndex: Map<string, number>; // file -> maintainability
  
  // Dependency metrics
  dependencyDepth: Map<string, number>; // How deep is dependency chain
  circularDependencies: string[][]; // Cycles in dependency graph
  
  // Code health
  unusedCode: SymbolNode[];
  deadCode: SymbolNode[]; // Unreachable code
  duplicateCode: Array<{
    locations: Location[];
    similarity: number;
  }>;
  
  // Updated incrementally
  lastAnalyzed: Date;
}

export interface ParserConfig {
  language: string;
  // Incremental parsing
  enableIncremental: boolean;
  chunkSize?: number; // For streaming large files
  
  // Scope resolution
  resolveTypes: boolean;
  buildCallGraph: boolean;
  
  // Performance
  maxFileSize?: number; // Skip files larger than this
  parallelParsing?: boolean;
  cacheResults?: boolean;
}
