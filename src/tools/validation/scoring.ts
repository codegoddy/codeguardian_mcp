/**
 * Scoring and Fuzzy Matching Module
 *
 * This module provides scoring algorithms and fuzzy matching for generating
 * suggestions and recommendations in the validation system.
 *
 * Responsibilities:
 * - Calculate overall code quality scores (0-100) based on issue severity
 * - Generate actionable recommendations (REJECT, REVIEW, CAUTION, ACCEPT, CLEAN_UP)
 * - Implement Jaro-Winkler similarity for fuzzy string matching
 * - Suggest similar symbols using multiple matching strategies
 * - Detect structural similarity (camelCase, snake_case patterns)
 * - Extract symbol names from suggestion strings
 *
 * @format
 */

import type { ValidationIssue, DeadCodeIssue } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a recommendation for code quality
 */
export interface Recommendation {
  verdict: "REJECT" | "REVIEW" | "CAUTION" | "ACCEPT" | "CLEAN_UP";
  riskLevel: "critical" | "high" | "medium" | "low";
  message: string;
  action: string;
}

// ============================================================================
// Improved Fuzzy Matching for Suggestions
// ============================================================================

/**
 * Calculate Jaro-Winkler similarity between two strings.
 * Returns a value between 0 and 1, where 1 is an exact match.
 * Better than Levenshtein for typo detection.
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3;

  // Calculate common prefix (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  // Jaro-Winkler adjustment
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Check if two strings have similar structure (camelCase, snake_case patterns).
 */
export function hasSimilarStructure(s1: string, s2: string): boolean {
  // Extract word parts from camelCase or snake_case
  const extractParts = (s: string): string[] => {
    return s
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .split(/[_-]/)
      .filter((p) => p.length > 0);
  };

  const parts1 = extractParts(s1);
  const parts2 = extractParts(s2);

  // Check if they share significant word parts
  const shared = parts1.filter((p) =>
    parts2.some((p2) => p === p2 || p.includes(p2) || p2.includes(p)),
  );
  return shared.length > 0;
}

/**
 * Calculate common prefix length between two strings.
 */
function commonPrefixLength(s1: string, s2: string): number {
  let i = 0;
  while (i < s1.length && i < s2.length && s1[i] === s2[i]) {
    i++;
  }
  return i;
}

/**
 * Suggest similar symbols using multiple matching strategies.
 * Combines Jaro-Winkler similarity, substring matching, and structural similarity.
 */
export function suggestSimilar(target: string, available: string[]): string {
  if (available.length === 0) {
    return "No similar symbols found. This may be a hallucination.";
  }

  const targetLower = target.toLowerCase();

  // Score each available symbol
  const scored = available.map((name) => {
    const nameLower = name.toLowerCase();
    let score = 0;

    // Jaro-Winkler similarity (0-1, weighted heavily)
    const jwScore = jaroWinklerSimilarity(targetLower, nameLower);
    score += jwScore * 50;

    // Substring matching
    if (nameLower.includes(targetLower) || targetLower.includes(nameLower)) {
      score += 30;
    }

    // Structural similarity (shared word parts)
    if (hasSimilarStructure(target, name)) {
      score += 20;
    }

    // Prefix matching bonus
    const prefixLen = commonPrefixLength(targetLower, nameLower);
    score += prefixLen * 5;

    // Same length bonus (typos often preserve length)
    if (target.length === name.length) {
      score += 10;
    }

    return { name, score };
  });

  // Sort by score descending and take top 3
  const topMatches = scored
    .filter((s) => s.score > 25) // Minimum threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.name);

  if (topMatches.length > 0) {
    return `Did you mean: ${topMatches.join(", ")}?`;
  }

  return "No similar symbols found. This may be a hallucination.";
}

/**
 * Extract similar symbol names from a suggestion string
 */
export function extractSimilarSymbols(suggestion: string): string[] {
  // Extract symbols from "Did you mean: symbol1, symbol2?" format
  const match = suggestion.match(/Did you mean: ([^?]+)\?/);
  if (match) {
    return match[1].split(",").map((s) => s.trim());
  }
  return [];
}

// ============================================================================
// Scoring and Recommendations
// ============================================================================

/**
 * Calculate overall code quality score (0-100) based on issue severity
 */
export function calculateScore(
  issues: ValidationIssue[],
  deadCode: DeadCodeIssue[] = [],
): number {
  if (issues.length === 0 && deadCode.length === 0) return 100;

  const weights = { critical: 25, high: 15, medium: 8, low: 3, warning: 3 };
  let deductions = 0;

  for (const issue of issues) {
    deductions += weights[issue.severity] || 5;
  }

  for (const dc of deadCode) {
    deductions += dc.severity === "medium" ? 5 : 2;
  }

  return Math.max(0, 100 - deductions);
}

/**
 * Generate actionable recommendation based on score and issues
 */
export function generateRecommendation(
  score: number,
  issues: ValidationIssue[],
  deadCode: DeadCodeIssue[] = [],
): Recommendation {
  const critical = issues.filter((i) => i.severity === "critical");
  const high = issues.filter((i) => i.severity === "high");
  const depHallucinations = issues.filter(
    (i) => i.type === "dependencyHallucination",
  );

  if (depHallucinations.length > 0) {
    return {
      verdict: "REJECT",
      riskLevel: "critical",
      message: `❌ MISSING DEPENDENCIES - ${depHallucinations.length} package(s) not in manifest`,
      action: "Install missing packages before using this code",
    };
  }

  const architectureIssues = issues.filter(i => i.type === "architecturalDeviation");
  const semanticBridgeIssues = architectureIssues.filter(i => i.message.includes("impact"));

  if (semanticBridgeIssues.length > 0) {
    return {
      verdict: "CAUTION",
      riskLevel: "high",
      message: `🌉 SEMANTIC BRIDGE ALERT - High cross-language impact detected`,
      action: "Review downstream consumers in the other language before proceeding",
    };
  }

  if (critical.length > 0) {
    return {
      verdict: "REJECT",
      riskLevel: "critical",
      message: `❌ DO NOT USE - ${critical.length} hallucination(s): references to non-existent code`,
      action: "Fix all critical issues before using this code",
    };
  }

  if (high.length > 2) {
    return {
      verdict: "REVIEW",
      riskLevel: "high",
      message: `⚠️ HIGH RISK - ${issues.length} hallucination(s) found`,
      action: "Manually verify each flagged symbol exists in your codebase",
    };
  }

  if (issues.length > 0) {
    return {
      verdict: "CAUTION",
      riskLevel: "medium",
      message: `⚡ ${issues.length} potential hallucination(s) detected`,
      action: "Verify flagged symbols exist in your codebase",
    };
  }

  if (deadCode.length > 0) {
    return {
      verdict: "CLEAN_UP",
      riskLevel: "low",
      message: `🧹 ${deadCode.length} dead code issue(s) - unused exports/files`,
      action: "Consider removing unused code to reduce maintenance burden",
    };
  }

  return {
    verdict: "ACCEPT",
    riskLevel: "low",
    message: "✅ LOOKS GOOD - No hallucinations or dead code detected",
    action: "Code appears consistent with your project",
  };
}
