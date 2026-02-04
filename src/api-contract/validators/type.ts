/**
 * API Contract Guardian - Type Validator
 *
 * Validates type compatibility between TypeScript and Python types.
 *
 * @format
 */

import type {
  TypeMapping,
  ApiContractIssue,
  ContractContext,
} from "../types.js";

/**
 * Comprehensive type compatibility checker
 */
export interface TypeCompatibilityResult {
  compatible: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
}

/**
 * Validate type mapping for deep compatibility
 */
export function validateTypeCompatibility(
  typeMapping: TypeMapping,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  const frontendType = typeMapping.frontend;
  const backendModel = typeMapping.backend;

  // Check overall compatibility score
  if (typeMapping.compatibility.score < 50) {
    issues.push({
      type: "apiTypeMismatch",
      severity: "high",
      message: `Low compatibility score (${typeMapping.compatibility.score}) between frontend type '${frontendType.name}' and backend model '${backendModel.name}'`,
      file: frontendType.file,
      line: frontendType.line,
      suggestion: "Review type definitions for significant differences",
      confidence: typeMapping.compatibility.score,
    });
  }

  // Validate each field's type compatibility
  for (const frontendField of frontendType.fields) {
    const backendField = backendModel.fields.find(
      (f) => normalizeName(f.name) === normalizeName(frontendField.name),
    );

    if (backendField) {
      const compatibility = checkFieldCompatibility(
        frontendField.name,
        frontendField.type,
        backendField.type,
      );

      if (!compatibility.compatible) {
        issues.push({
          type: "apiTypeMismatch",
          severity: compatibility.severity as "high" | "medium" | "low",
          message: `Type compatibility issue for '${frontendField.name}': ${compatibility.reason}`,
          file: frontendType.file,
          line: frontendType.line,
          suggestion: compatibility.suggestion,
          confidence: compatibility.confidence,
        });
      }
    }
  }

  return issues;
}

/**
 * Check compatibility between two field types
 */
function checkFieldCompatibility(
  fieldName: string,
  tsType: string,
  pyType: string,
): {
  compatible: boolean;
  severity: string;
  reason: string;
  suggestion: string;
  confidence: number;
} {
  // Normalize types
  const normalizedTs = normalizeType(tsType);
  const normalizedPy = normalizeType(pyType);

  // Check for known compatible pairs
  if (isKnownCompatiblePair(normalizedTs, normalizedPy)) {
    return {
      compatible: true,
      severity: "low",
      reason: "",
      suggestion: "",
      confidence: 100,
    };
  }

  // Check for problematic pairs
  const problematicResult = checkProblematicPairs(fieldName, normalizedTs, normalizedPy);
  if (problematicResult) {
    return problematicResult;
  }

  // Default: assume compatible with warning
  return {
    compatible: true,
    severity: "low",
    reason: "",
    suggestion: "",
    confidence: 70,
  };
}

/**
 * Check if types are known to be compatible
 */
function isKnownCompatiblePair(tsType: string, pyType: string): boolean {
  const compatibleMap: Record<string, string[]> = {
    string: ["str", "string", "text", "email", "uuid"],
    number: ["int", "float", "integer"],
    boolean: ["bool", "boolean"],
    any: ["any"],
    unknown: ["any"],
  };

  const compatibleTypes = compatibleMap[tsType] || [];
  return compatibleTypes.includes(pyType);
}

/**
 * Check for problematic type pairs that need attention
 */
function checkProblematicPairs(
  fieldName: string,
  tsType: string,
  pyType: string,
): {
  compatible: boolean;
  severity: string;
  reason: string;
  suggestion: string;
  confidence: number;
} | null {
  // UUID handling
  if (pyType === "uuid" && tsType !== "string") {
    return {
      compatible: false,
      severity: "medium",
      reason: `Backend uses UUID type, frontend uses ${tsType}`,
      suggestion: `Use 'string' type for ${fieldName} (UUIDs serialize to strings in JSON)`,
      confidence: 90,
    };
  }

  // Decimal/Float handling for monetary values
  if (pyType === "decimal" && tsType === "number") {
    return {
      compatible: true,
      severity: "medium",
      reason: `Backend uses Decimal for precision, frontend uses number`,
      suggestion: `Consider using string for ${fieldName} to avoid floating-point precision issues`,
      confidence: 80,
    };
  }

  // DateTime handling
  if ((pyType === "datetime" || pyType === "date") && tsType !== "string") {
    return {
      compatible: false,
      severity: "high",
      reason: `Backend uses ${pyType}, frontend uses ${tsType}`,
      suggestion: `Use 'string' type for ${fieldName} (dates serialize to ISO strings)`,
      confidence: 95,
    };
  }

  // Array/List handling
  if (tsType.includes("[]") && !(pyType.includes("list") || pyType.includes("List"))) {
    return {
      compatible: false,
      severity: "high",
      reason: `Frontend expects array, backend uses ${pyType}`,
      suggestion: `Ensure backend field ${fieldName} is a list/array type`,
      confidence: 90,
    };
  }

  return null;
}

/**
 * Get detailed compatibility report for a type mapping
 */
export function getCompatibilityReport(
  typeMapping: TypeMapping,
): TypeCompatibilityResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let totalConfidence = 100;

  const frontendType = typeMapping.frontend;
  const backendModel = typeMapping.backend;

  // Check field coverage
  const frontendFieldNames = new Set(frontendType.fields.map((f) => normalizeName(f.name)));
  const backendFieldNames = new Set(backendModel.fields.map((f) => normalizeName(f.name)));

  const commonFields = [...frontendFieldNames].filter((f) => backendFieldNames.has(f));
  const coverage = commonFields.length / Math.max(frontendFieldNames.size, backendFieldNames.size);

  if (coverage < 0.8) {
    issues.push(`Low field coverage: ${Math.round(coverage * 100)}% of fields match`);
    suggestions.push("Review type definitions for missing or extra fields");
    totalConfidence -= 20;
  }

  // Check type compatibility for each field
  for (const frontendField of frontendType.fields) {
    const backendField = backendModel.fields.find(
      (f) => normalizeName(f.name) === normalizeName(frontendField.name),
    );

    if (backendField) {
      const compatibility = checkFieldCompatibility(
        frontendField.name,
        frontendField.type,
        backendField.type,
      );

      if (!compatibility.compatible) {
        issues.push(compatibility.reason);
        suggestions.push(compatibility.suggestion);
        totalConfidence -= 10;
      }
    }
  }

  return {
    compatible: issues.length === 0,
    confidence: Math.max(0, totalConfidence),
    issues,
    suggestions,
  };
}

/**
 * Validate all type mappings in the contract context
 */
export function validateAllTypes(
  context: ContractContext,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  for (const typeMapping of context.types.values()) {
    const typeIssues = validateTypeCompatibility(typeMapping);
    issues.push(...typeIssues);
  }

  return issues;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a type name for comparison
 */
function normalizeType(type: string): string {
  return type
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\[\]/g, "array")
    .replace(/optional\[/g, "")
    .replace(/\]/g, "")
    .replace(/list\[/g, "array_")
    .replace(/\|/g, "_or_");
}

/**
 * Normalize a field name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/_/g, "")
    .replace(/-/g, "");
}

/**
 * Get type conversion recommendation
 */
export function getTypeConversionRecommendation(
  tsType: string,
  pyType: string,
): string {
  const recommendations: Record<string, Record<string, string>> = {
    string: {
      uuid: "UUIDs are serialized as strings in JSON - this is correct",
      datetime: "Dates should be ISO 8601 strings - this is correct",
      decimal: "Consider using string for monetary values to avoid precision loss",
    },
    number: {
      decimal: "Consider using string for monetary values to avoid floating-point issues",
      int: "Ensure the value is an integer",
      float: "Standard number type - should work fine",
    },
  };

  return (
    recommendations[tsType]?.[pyType] ||
    `Types appear compatible: ${tsType} ↔ ${pyType}`
  );
}

/**
 * Check if a type requires special serialization handling
 */
export function requiresSerializationHandling(
  tsType: string,
  pyType: string,
): boolean {
  const specialCases = [
    { ts: "string", py: "uuid" },
    { ts: "string", py: "datetime" },
    { ts: "string", py: "date" },
    { ts: "number", py: "decimal" },
  ];

  return specialCases.some(
    (c) =>
      normalizeType(tsType) === normalizeType(c.ts) &&
      normalizeType(pyType) === normalizeType(c.py),
  );
}
