/**
 * Shared Type Definitions for Validation System
 *
 * This module contains all shared interfaces used across the validation system.
 * These types define the data structures for AST extraction, validation results,
 * and project analysis.
 *
 * @format
 */

// ============================================================================
// AST Extraction Types
// ============================================================================

/**
 * Represents a symbol definition found in code (function, class, method, etc.)
 */
export interface ASTSymbol {
  name: string;
  type:
    | "function"
    | "class"
    | "method"
    | "variable"
    | "import"
    | "decorator"
    | "interface"
    | "type"
    | "route";
  file: string;
  line: number;
  column: number;
  params?: string[];
  paramCount?: number;
  returnType?: string;
  scope?: string;
  isAsync?: boolean;
  isExported?: boolean;
  decorators?: string[];
}

/**
 * Represents a symbol usage in code (function call, method call, etc.)
 */
export interface ASTUsage {
  name: string;
  type: "call" | "methodCall" | "instantiation" | "attribute" | "reference";
  object?: string;
  line: number;
  column: number;
  code: string;
  argCount?: number;
  isExternal?: boolean;
}

/**
 * Represents an import statement in code
 */
export interface ASTImport {
  module: string;
  names: Array<{ imported: string; local: string }>;
  isExternal: boolean;
  line: number;
}

/**
 * Represents a type reference found in code
 * Used for detecting same-file type usage (not just imports)
 */
export interface ASTTypeReference {
  name: string;
  context:
    | "typeAnnotation"
    | "genericParam"
    | "extends"
    | "implements"
    | "returnType"
    | "propertyType";
  line: number;
}

// ============================================================================
// Validation Result Types
// ============================================================================

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "warning";

/**
 * Represents a validation issue found in code (hallucination, wrong param count, etc.)
 */
export interface ValidationIssue {
  type:
    | "nonExistentFunction"
    | "nonExistentClass"
    | "nonExistentMethod"
    | "wrongParamCount"
    | "nonExistentImport"
    | "dependencyHallucination"
    | "undefinedVariable"
    | "unusedImport"
    | "architecturalDeviation"
    | "missingDependency";
  severity: IssueSeverity;
  message: string;
  line: number;
  file: string;
  code: string;
  suggestion: string;
  confidence?: number; // 0-100, how confident we are this is an issue
  reasoning?: string; // Why we think this is an issue
}

/**
 * Represents a dead code issue (unused export, orphaned file, etc.)
 */
export interface DeadCodeIssue {
  type: "unusedExport" | "orphanedFile" | "unusedFunction";
  severity: "medium" | "low" | "warning";
  name: string;
  file: string;
  message: string;
  line?: number;
  suggestion?: string;
}

// ============================================================================
// Project Analysis Types
// ============================================================================

/**
 * Represents a symbol in the project symbol table
 * Used for validation and dead code detection
 */
export interface ProjectSymbol {
  name: string;
  type: "function" | "class" | "method" | "variable" | "import" | "decorator";
  file: string;
  line?: number;
  params?: string[];
  paramCount?: number;
  scope?: string;
  isAsync?: boolean;
  decorators?: string[];
}

/**
 * Represents dependencies loaded from manifest files
 * (package.json, requirements.txt, pyproject.toml)
 */
export interface ManifestDependencies {
  dependencies: Set<string>;
  devDependencies: Set<string>;
  all: Set<string>;
}

/**
 * Represents the current user session context (Augment Secret #3)
 */
export interface SessionContext {
  recentlyEditedFiles: string[];
  activeBranch?: string;
}
