/**
 * Symbol-Level Dependency Graph Types
 *
 * Tracks relationships between symbols (functions, classes, etc.) across the codebase.
 * Inspired by Augment Code's semantic dependency graphs.
 *
 * @format
 */

/**
 * Represents a relationship between two symbols
 */
export interface SymbolRelationship {
  from: string; // Symbol name that references
  to: string; // Symbol name being referenced
  type: RelationType; // Type of relationship
  file: string; // File where relationship occurs
  line?: number; // Line number where relationship occurs
  confidence: number; // Confidence score (0-1)
  reason?: string; // Optional reason for the relationship
}

/**
 * Types of relationships between symbols
 */
export type RelationType =
  | "calls" // Function A calls function B
  | "instantiates" // Code instantiates class B
  | "extends" // Class A extends class B
  | "implements" // Class A implements interface B
  | "imports" // File imports symbol B
  | "references" // Generic reference to symbol B
  | "co-occurs"; // Symbols often used together

/**
 * Symbol usage statistics
 */
export interface SymbolUsage {
  symbol: string;
  usageCount: number; // How many times it's used
  importCount: number; // How many files import it
  calledBy: Set<string>; // Symbols that call/use this
  calls: Set<string>; // Symbols this calls/uses
  coOccurs: Map<string, number>; // Symbols often used together (symbol -> count)
  files: Set<string>; // Files where this symbol appears
}

/**
 * Symbol-level dependency graph
 */
export interface SymbolGraph {
  // All relationships in the codebase
  relationships: SymbolRelationship[];

  // Usage statistics per symbol
  usage: Map<string, SymbolUsage>;

  // Quick lookups
  symbolToFiles: Map<string, Set<string>>; // Symbol -> files defining it
  fileToSymbols: Map<string, Set<string>>; // File -> symbols defined in it

  // Co-occurrence matrix (for "symbols often used together")
  coOccurrence: Map<string, Map<string, number>>;
}

/**
 * Options for building symbol graph
 */
export interface SymbolGraphOptions {
  includeCallRelationships?: boolean; // Track function calls (slower but more accurate)
  includeCoOccurrence?: boolean; // Track symbols used together
  minCoOccurrenceCount?: number; // Minimum times symbols must co-occur
  maxDepth?: number; // Max depth for relationship traversal
}

/**
 * Result of querying related symbols
 */
export interface RelatedSymbols {
  symbol: string;
  related: Array<{
    symbol: string;
    relationship: RelationType;
    score: number; // Relevance score (0-1)
    reason: string; // Why it's related
  }>;
}
