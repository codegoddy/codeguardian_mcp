/**
 * Anti-Patterns Analyzer
 *
 * Loads and provides AI anti-patterns for enriching validation results.
 * Used for LLM context and educational purposes - NOT for regex validation.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface AntiPattern {
  id: string;
  name: string;
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  pattern: string;
  languages: string[];
  fix: string;
  example: string;
  aiGenerated: boolean;
}

interface AntiPatternsDatabase {
  patterns: AntiPattern[];
}

// ============================================================================
// Cache
// ============================================================================

let antiPatternsCache: AntiPattern[] | null = null;

// ============================================================================
// Loader
// ============================================================================

/**
 * Load anti-patterns from JSON file
 * Caches result for performance
 */
export async function loadAntiPatterns(): Promise<AntiPattern[]> {
  if (antiPatternsCache) {
    return antiPatternsCache;
  }

  try {
    // Get the directory of the current module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Path to anti-patterns JSON (relative to src/)
    const patternsPath = path.resolve(__dirname, "../../rules/anti-patterns/ai-anti-patterns.json");

    const data = await fs.readFile(patternsPath, "utf-8");
    const db: AntiPatternsDatabase = JSON.parse(data);

    antiPatternsCache = db.patterns;
    logger.info(`Loaded ${antiPatternsCache.length} anti-patterns`);

    return antiPatternsCache;
  } catch (error) {
    logger.error("Failed to load anti-patterns:", error);
    return [];
  }
}

/**
 * Get anti-patterns synchronously (from cache)
 * Returns empty array if not yet loaded
 */
export function getAntiPatternsSync(): AntiPattern[] {
  return antiPatternsCache || [];
}

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Find anti-patterns relevant to a specific issue type
 */
export async function getRelevantAntiPatterns(
  issueType: string,
  language?: string,
): Promise<AntiPattern[]> {
  const patterns = await loadAntiPatterns();

  // Map validation issue types to anti-pattern categories
  const categoryMap: Record<string, string[]> = {
    undefinedVariable: ["maintainability", "bugs"],
    nonExistentMethod: ["maintainability"],
    nonExistentFunction: ["maintainability"],
    nonExistentImport: ["maintainability"],
    nonExistentClass: ["maintainability"],
    unusedImport: ["dead-code"],
    dependencyHallucination: ["maintainability"],
    deadCode: ["dead-code"],
    highComplexity: ["complexity"],
    longFunction: ["complexity"],
    deepNesting: ["complexity"],
    architecturalDeviation: ["maintainability"],
  };

  const relevantCategories = categoryMap[issueType] || [];

  return patterns.filter((pattern) => {
    // Match by category
    const categoryMatch = relevantCategories.includes(pattern.category);

    // Filter by language if specified
    const languageMatch = language
      ? pattern.languages.includes(language) || pattern.languages.includes("javascript")
      : true;

    return categoryMatch && languageMatch;
  });
}

/**
 * Get anti-patterns by category
 */
export async function getAntiPatternsByCategory(
  category: string,
): Promise<AntiPattern[]> {
  const patterns = await loadAntiPatterns();
  return patterns.filter((p) => p.category === category);
}

/**
 * Get AI-specific anti-patterns (common AI mistakes)
 */
export async function getAIAntiPatterns(): Promise<AntiPattern[]> {
  const patterns = await loadAntiPatterns();
  return patterns.filter((p) => p.aiGenerated);
}

// ============================================================================
// Enrichment Functions
// ============================================================================

/**
 * Enrich a validation issue with relevant anti-pattern context
 * Returns the enriched issue (non-destructive)
 */
export async function enrichIssueWithAntiPattern(
  issue: any,
  language?: string,
): Promise<any> {
  try {
    const relevantPatterns = await getRelevantAntiPatterns(issue.type, language);

    if (relevantPatterns.length === 0) {
      return issue;
    }

    // Find the most relevant pattern (first match for now)
    const primaryPattern = relevantPatterns[0];

    return {
      ...issue,
      antiPattern: {
        id: primaryPattern.id,
        name: primaryPattern.name,
        category: primaryPattern.category,
        description: primaryPattern.description,
        fix: primaryPattern.fix,
        example: primaryPattern.example,
      },
    };
  } catch (error) {
    logger.warn("Failed to enrich issue with anti-pattern:", error);
    return issue;
  }
}

/**
 * Batch enrich multiple issues
 */
export async function enrichIssuesWithAntiPatterns(
  issues: any[],
  language?: string,
): Promise<any[]> {
  return Promise.all(issues.map((issue) => enrichIssueWithAntiPattern(issue, language)));
}

// ============================================================================
// LLM Context Generation
// ============================================================================

/**
 * Generate LLM context from anti-patterns relevant to the issues
 */
export async function generateAntiPatternContext(
  issues: any[],
  language?: string,
): Promise<string> {
  try {
    // Get unique categories from issues
    const categories = new Set<string>();
    const categoryMap: Record<string, string[]> = {
      undefinedVariable: ["maintainability"],
      nonExistentMethod: ["maintainability"],
      nonExistentFunction: ["maintainability"],
      unusedImport: ["dead-code"],
      deadCode: ["dead-code"],
      highComplexity: ["complexity"],
      longFunction: ["complexity"],
      deepNesting: ["complexity"],
    };

    issues.forEach((issue) => {
      const cats = categoryMap[issue.type] || [];
      cats.forEach((c) => categories.add(c));
    });

    if (categories.size === 0) {
      return "";
    }

    // Load relevant anti-patterns
    const patterns = await loadAntiPatterns();
    const relevantPatterns = patterns.filter(
      (p) => categories.has(p.category) && (!language || p.languages.includes(language)),
    );

    if (relevantPatterns.length === 0) {
      return "";
    }

    // Format for LLM
    const sections = relevantPatterns.map((p) => {
      return `### ${p.id}: ${p.name}
- **Category:** ${p.category}
- **Severity:** ${p.severity}
- **Problem:** ${p.description}
- **Fix:** ${p.fix}
${p.aiGenerated ? "- **Note:** Common in AI-generated code" : ""}`;
    });

    return `## Relevant Anti-Patterns to Avoid

${sections.join("\n\n")}

When suggesting fixes, ensure you don't introduce these anti-patterns.`;
  } catch (error) {
    logger.warn("Failed to generate anti-pattern context:", error);
    return "";
  }
}

/**
 * Get educational summary for a specific anti-pattern ID
 */
export async function getAntiPatternById(id: string): Promise<AntiPattern | null> {
  const patterns = await loadAntiPatterns();
  return patterns.find((p) => p.id === id) || null;
}
