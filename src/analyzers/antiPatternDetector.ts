/**
 * AI Anti-Pattern Detector
 *
 * Detects common anti-patterns in AI-generated code
 * Helps improve code quality and maintainability
 *
 * @format
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);

export interface AntiPattern {
  id: string;
  name: string;
  category: string;
  severity: "high" | "medium" | "low";
  description: string;
  line: number;
  column: number;
  code: string;
  fix: string;
  example: string;
  confidence: number;
}

interface AntiPatternRule {
  id: string;
  name: string;
  category: string;
  severity: "high" | "medium" | "low";
  description: string;
  pattern: string;
  languages: string[];
  fix: string;
  example: string;
  aiGenerated: boolean;
}

/**
 * Load anti-pattern rules from JSON file
 */
function loadAntiPatternRules(): AntiPatternRule[] {
  try {
    const possiblePaths = [
      join(currentDirPath, "../../../rules/anti-patterns/ai-anti-patterns.json"),
      join(process.cwd(), "rules/anti-patterns/ai-anti-patterns.json"),
    ];

    for (const rulesPath of possiblePaths) {
      try {
        const rulesData = readFileSync(rulesPath, "utf-8");
        const parsed = JSON.parse(rulesData);
        logger.debug(
          `Loaded ${parsed.patterns?.length || 0} anti-pattern rules from ${rulesPath}`
        );
        return parsed.patterns || [];
      } catch (err) {
        continue;
      }
    }

    logger.error("Could not find anti-pattern rules file");
    return [];
  } catch (error) {
    logger.error("Error loading anti-pattern rules:", error);
    return [];
  }
}

/**
 * Detect anti-patterns in code
 */
export async function detectAntiPatterns(
  code: string,
  language: string,
  options: {
    severityLevel?: "high" | "medium" | "low";
    categories?: string[];
  } = {}
): Promise<AntiPattern[]> {
  logger.debug(`Detecting anti-patterns in ${language} code...`);

  const antiPatterns: AntiPattern[] = [];
  const rules = loadAntiPatternRules();

  // Filter rules by language and options
  const filteredRules = rules.filter((rule) => {
    // Check language support
    if (!rule.languages.includes(language)) return false;

    // Check severity level
    if (options.severityLevel) {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      const ruleSeverity = severityOrder[rule.severity];
      const minSeverity = severityOrder[options.severityLevel];
      if (ruleSeverity < minSeverity) return false;
    }

    // Check categories
    if (options.categories && options.categories.length > 0) {
      if (!options.categories.includes(rule.category)) return false;
    }

    return true;
  });

  const lines = code.split("\n");

  // Scan each rule
  for (const rule of filteredRules) {
    try {
      const pattern = new RegExp(rule.pattern, "gm");

      lines.forEach((line, index) => {
        const trimmed = line.trim();

        // Skip comment lines
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("#")
        ) {
          return;
        }

        // Remove inline comments
        const codeWithoutComments = line.split("//")[0].split("#")[0];

        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(codeWithoutComments)) !== null) {
          antiPatterns.push({
            id: rule.id,
            name: rule.name,
            category: rule.category,
            severity: rule.severity,
            description: rule.description,
            line: index + 1,
            column: match.index,
            code: line.trim(),
            fix: rule.fix,
            example: rule.example,
            confidence: calculateConfidence(rule, match[0]),
          });
        }
      });
    } catch (error) {
      logger.error(`Error applying anti-pattern rule ${rule.id}:`, error);
    }
  }

  logger.debug(`Found ${antiPatterns.length} anti-patterns`);
  return antiPatterns;
}

/**
 * Calculate confidence score for an anti-pattern detection
 */
function calculateConfidence(
  rule: AntiPatternRule,
  matchedText: string
): number {
  let confidence = 75; // Base confidence

  // Increase confidence for high severity patterns
  if (rule.severity === "high") {
    confidence += 10;
  }

  // Increase confidence for specific patterns
  if (rule.category === "error-handling" || rule.category === "safety") {
    confidence += 5;
  }

  // Decrease confidence for style-related patterns
  if (rule.category === "style") {
    confidence -= 10;
  }

  return Math.min(95, Math.max(60, confidence));
}

/**
 * Calculate code quality score based on anti-patterns (0-100, higher is better)
 */
export function calculateQualityScore(antiPatterns: AntiPattern[]): number {
  if (antiPatterns.length === 0) return 100;

  const weights = {
    high: 10,
    medium: 5,
    low: 2,
  };

  let totalDeductions = 0;
  for (const pattern of antiPatterns) {
    totalDeductions += weights[pattern.severity];
  }

  return Math.max(0, 100 - totalDeductions);
}

/**
 * Group anti-patterns by category
 */
export function groupByCategory(
  antiPatterns: AntiPattern[]
): Record<string, AntiPattern[]> {
  const grouped: Record<string, AntiPattern[]> = {};

  for (const pattern of antiPatterns) {
    if (!grouped[pattern.category]) {
      grouped[pattern.category] = [];
    }
    grouped[pattern.category].push(pattern);
  }

  return grouped;
}

/**
 * Get anti-pattern summary
 */
export function getAntiPatternSummary(antiPatterns: AntiPattern[]): {
  high: number;
  medium: number;
  low: number;
  total: number;
  byCategory: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};

  for (const pattern of antiPatterns) {
    byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
  }

  return {
    high: antiPatterns.filter((p) => p.severity === "high").length,
    medium: antiPatterns.filter((p) => p.severity === "medium").length,
    low: antiPatterns.filter((p) => p.severity === "low").length,
    total: antiPatterns.length,
    byCategory,
  };
}

/**
 * Get top anti-patterns by frequency
 */
export function getTopAntiPatterns(
  antiPatterns: AntiPattern[],
  limit: number = 5
): Array<{
  name: string;
  count: number;
  severity: string;
}> {
  const counts = new Map<string, { count: number; severity: string }>();

  for (const pattern of antiPatterns) {
    const existing = counts.get(pattern.name);
    if (existing) {
      existing.count++;
    } else {
      counts.set(pattern.name, { count: 1, severity: pattern.severity });
    }
  }

  return Array.from(counts.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
