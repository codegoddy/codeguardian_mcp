/**
 * API Contract Guardian - Parameter Validator
 *
 * Validates request/response parameters and field compatibility.
 *
 * @format
 */

import type {
  TypeDefinition,
  ModelDefinition,
  TypeMapping,
  ApiContractIssue,
  ContractContext,
} from "../types.js";

/**
 * Validate type mapping for parameter issues
 */
export function validateParameters(
  typeMapping: TypeMapping,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  const frontendType = typeMapping.frontend;
  const backendModel = typeMapping.backend;

  // Check for missing required fields in frontend
  const missingFields = findMissingRequiredFields(frontendType, backendModel);
  for (const field of missingFields) {
    issues.push({
      type: "apiMissingRequiredField",
      severity: "high",
      message: `Missing required field '${field.name}' in frontend type '${frontendType.name}'`,
      file: frontendType.file,
      line: frontendType.line,
      suggestion: `Add '${field.name}: ${field.type}' to ${frontendType.name} interface`,
      confidence: 95,
    });
  }

  // Check for naming convention mismatches
  const namingIssues = findNamingConventionMismatches(frontendType, backendModel);
  issues.push(...namingIssues);

  // Check for type compatibility
  const typeIssues = findTypeCompatibilityIssues(frontendType, backendModel);
  issues.push(...typeIssues);

  // Check for extra fields in frontend (optional - warning only)
  const extraFields = findExtraFields(frontendType, backendModel);
  for (const field of extraFields) {
    issues.push({
      type: "apiExtraField",
      severity: "low",
      message: `Field '${field.name}' exists in frontend but not in backend model`,
      file: frontendType.file,
      line: frontendType.line,
      suggestion: `Remove '${field.name}' or add it to backend model '${backendModel.name}'`,
      confidence: 70,
    });
  }

  return issues;
}

/**
 * Find required fields in backend that are missing in frontend
 */
function findMissingRequiredFields(
  frontendType: TypeDefinition,
  backendModel: ModelDefinition,
): Array<{ name: string; type: string }> {
  const missing: Array<{ name: string; type: string }> = [];

  for (const backendField of backendModel.fields) {
    if (backendField.required) {
      const frontendField = frontendType.fields.find(
        (f) => normalizeName(f.name) === normalizeName(backendField.name),
      );

      if (!frontendField) {
        missing.push({
          name: backendField.name,
          type: backendField.type,
        });
      }
    }
  }

  return missing;
}

/**
 * Find naming convention mismatches between frontend and backend
 */
function findNamingConventionMismatches(
  frontendType: TypeDefinition,
  backendModel: ModelDefinition,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  for (const frontendField of frontendType.fields) {
    const backendField = backendModel.fields.find(
      (f) => normalizeName(f.name) === normalizeName(frontendField.name),
    );

    if (backendField && frontendField.name !== backendField.name) {
      // Determine which convention is being used
      const frontendConvention = detectNamingConvention(frontendField.name);
      const backendConvention = detectNamingConvention(backendField.name);

      if (frontendConvention !== backendConvention) {
        issues.push({
          type: "apiNamingConventionMismatch",
          severity: "medium",
          message: `Naming convention mismatch: frontend uses '${frontendField.name}' (${frontendConvention}), backend uses '${backendField.name}' (${backendConvention})`,
          file: frontendType.file,
          line: frontendType.line,
          suggestion: `Rename to '${backendField.name}' to match backend convention`,
          confidence: 90,
        });
      }
    }
  }

  return issues;
}

/**
 * Find type compatibility issues between frontend and backend
 */
function findTypeCompatibilityIssues(
  frontendType: TypeDefinition,
  backendModel: ModelDefinition,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  for (const frontendField of frontendType.fields) {
    const backendField = backendModel.fields.find(
      (f) => normalizeName(f.name) === normalizeName(frontendField.name),
    );

    if (backendField) {
      const compatible = areTypesCompatible(frontendField.type, backendField.type);

      if (!compatible) {
        issues.push({
          type: "apiTypeMismatch",
          severity: "medium",
          message: `Type mismatch for field '${frontendField.name}': frontend uses '${frontendField.type}', backend expects '${backendField.type}'`,
          file: frontendType.file,
          line: frontendType.line,
          suggestion: getTypeCompatibilitySuggestion(frontendField.type, backendField.type),
          confidence: 85,
        });
      }
    }
  }

  return issues;
}

/**
 * Find extra fields in frontend that don't exist in backend
 */
function findExtraFields(
  frontendType: TypeDefinition,
  backendModel: ModelDefinition,
): Array<{ name: string; type: string }> {
  const extra: Array<{ name: string; type: string }> = [];

  for (const frontendField of frontendType.fields) {
    const backendField = backendModel.fields.find(
      (f) => normalizeName(f.name) === normalizeName(frontendField.name),
    );

    if (!backendField) {
      extra.push({
        name: frontendField.name,
        type: frontendField.type,
      });
    }
  }

  return extra;
}

/**
 * Validate all type mappings in the contract context
 */
export function validateAllParameters(
  context: ContractContext,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  for (const typeMapping of context.types.values()) {
    const typeIssues = validateParameters(typeMapping);
    issues.push(...typeIssues);
  }

  return issues;
}

// ============================================================================
// Type Compatibility
// ============================================================================

/**
 * Check if TypeScript and Python types are compatible
 */
function areTypesCompatible(tsType: string, pyType: string): boolean {
  // Normalize types
  const normalizedTs = normalizeType(tsType);
  const normalizedPy = normalizeType(pyType);

  // Direct match
  if (normalizedTs === normalizedPy) {
    return true;
  }

  // Type mapping
  const compatibleTypes = getCompatibleTypes(normalizedTs);
  if (compatibleTypes.includes(normalizedPy)) {
    return true;
  }

  // Handle optional types
  if (tsType.includes("?") || tsType.includes("undefined")) {
    return true;
  }
  if (pyType.toLowerCase().includes("optional")) {
    return true;
  }

  // Handle arrays/lists
  if (tsType.includes("[]") && (pyType.includes("list") || pyType.includes("List"))) {
    return true;
  }

  return false;
}

/**
 * Get compatible Python types for a TypeScript type
 */
function getCompatibleTypes(tsType: string): string[] {
  const typeMap: Record<string, string[]> = {
    string: ["str", "string", "text", "uuid", "email", "datetime", "date"],
    number: ["int", "float", "integer", "decimal", "number"],
    boolean: ["bool", "boolean"],
    date: ["datetime", "date"],
    any: ["any"],
    unknown: ["any"],
  };

  return typeMap[tsType] || [];
}

/**
 * Get suggestion for fixing type incompatibility
 */
function getTypeCompatibilitySuggestion(tsType: string, pyType: string): string {
  const suggestions: Record<string, Record<string, string>> = {
    string: {
      uuid: "Use string type for UUID (serialization)",
      datetime: "Use string type for dates (ISO format)",
      decimal: "Use string type for decimals (precision)",
    },
    number: {
      decimal: "Use string type for monetary values (precision)",
      int: "Ensure value is an integer",
      float: "Ensure value is a number",
    },
  };

  return (
    suggestions[tsType]?.[pyType] ||
    `Ensure types are compatible: ${tsType} vs ${pyType}`
  );
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
    .replace(/\[\]/g, "") // Remove array notation
    .replace(/optional\[/g, "") // Remove Optional wrapper
    .replace(/\]/g, "");
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
 * Detect naming convention of a field name
 */
function detectNamingConvention(name: string): string {
  if (name.includes("_")) {
    return "snake_case";
  }
  if (/^[a-z]+([A-Z][a-z]+)*$/.test(name)) {
    return "camelCase";
  }
  if (/^[A-Z][a-z]+([A-Z][a-z]+)*$/.test(name)) {
    return "PascalCase";
  }
  if (name.includes("-")) {
    return "kebab-case";
  }
  return "unknown";
}
