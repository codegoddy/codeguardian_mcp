/**
 * Security Scanner
 *
 * Scans code for security vulnerabilities using pattern matching
 * Covers OWASP Top 10 and AI-specific security risks
 *
 * @format
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../../utils/logger.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);

export interface SecurityVulnerability {
  id: string;
  name: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  line: number;
  column: number;
  code: string;
  cwe?: string;
  owaspCategory?: string;
  fixRecommendation: string;
  references: string[];
  confidence: number;
}

interface SecurityRule {
  id: string;
  name: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  pattern: string;
  languages?: string[]; // If specified, only apply to these languages
  cwe?: string;
  owasp?: string;
  fix: string;
  references: string[];
}

/**
 * Load security rules from JSON file
 */
function loadSecurityRules(language?: string): SecurityRule[] {
  try {
    const allRules: SecurityRule[] = [];

    // Load general security rules
    const generalPaths = [
      join(currentDirPath, "../../../rules/security/security-patterns.json"),
      join(process.cwd(), "rules/security/security-patterns.json"),
    ];

    for (const rulesPath of generalPaths) {
      try {
        const rulesData = readFileSync(rulesPath, "utf-8");
        const parsed = JSON.parse(rulesData);
        allRules.push(...(parsed.rules || []));
        logger.debug(
          `Loaded ${parsed.rules?.length || 0} general security rules from ${rulesPath}`
        );
        break;
      } catch (err) {
        continue;
      }
    }

    // Load language-specific rules if specified
    if (language === "python") {
      const pythonPaths = [
        join(
          currentDirPath,
          "../../../rules/security/python-security-patterns.json"
        ),
        join(process.cwd(), "rules/security/python-security-patterns.json"),
      ];

      for (const rulesPath of pythonPaths) {
        try {
          const rulesData = readFileSync(rulesPath, "utf-8");
          const parsed = JSON.parse(rulesData);
          allRules.push(...(parsed.rules || []));
          logger.debug(
            `Loaded ${parsed.rules?.length || 0} Python security rules from ${rulesPath}`
          );
          break;
        } catch (err) {
          continue;
        }
      }
    }

    if (allRules.length === 0) {
      logger.error(
        "Could not find security rules file in any expected location"
      );
    }

    return allRules;
  } catch (error) {
    logger.error("Error loading security rules:", error);
    return [];
  }
}

/**
 * Scan code for security vulnerabilities
 */
export async function scanForVulnerabilities(
  code: string,
  language: string,
  options: {
    severityLevel?: "critical" | "high" | "medium" | "low";
    categories?: string[];
    filePath?: string; // Add file path for context-aware scanning
  } = {}
): Promise<SecurityVulnerability[]> {
  logger.debug(`Scanning code for security vulnerabilities (${language})...`);

  const vulnerabilities: SecurityVulnerability[] = [];
  const rules = loadSecurityRules(language);

  // Detect if this is a test file
  const isTestFile =
    options.filePath ? isTestFilePath(options.filePath) : false;

  // Filter rules by severity if specified
  const filteredRules = rules.filter((rule) => {
    // Filter by language if the rule specifies languages
    if (rule.languages && rule.languages.length > 0) {
      if (!rule.languages.includes(language)) return false;
    }

    if (options.severityLevel) {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const ruleSeverity = severityOrder[rule.severity];
      const minSeverity = severityOrder[options.severityLevel];
      if (ruleSeverity < minSeverity) return false;
    }

    if (options.categories && options.categories.length > 0) {
      if (!options.categories.includes(rule.category)) return false;
    }

    return true;
  });

  const lines = code.split("\n");

  // Scan each rule
  for (const rule of filteredRules) {
    try {
      const pattern = new RegExp(rule.pattern, "gi");

      lines.forEach((line, index) => {
        const trimmedLine = line.trim();

        // Skip comment lines
        if (
          trimmedLine.startsWith("//") ||
          trimmedLine.startsWith("/*") ||
          trimmedLine.startsWith("*") ||
          trimmedLine.startsWith("#")
        ) {
          return;
        }

        // Remove inline comments
        const codeWithoutComments = line.split("//")[0];

        let match;
        pattern.lastIndex = 0; // Reset regex
        while ((match = pattern.exec(codeWithoutComments)) !== null) {
          // Skip false positives: matches inside regex pattern strings (r"..." or r'...')
          // These are detection patterns, not actual vulnerabilities
          if (isInsideRegexString(codeWithoutComments, match.index)) {
            continue;
          }

          // Skip false positives: matches inside error/warning message strings
          if (isInsideErrorMessage(codeWithoutComments, match.index)) {
            continue;
          }

          // Skip false positives: React prop spreading in component definitions
          if (isReactPropSpreading(rule.id, codeWithoutComments)) {
            continue;
          }

          // Skip false positives: console.log without actual sensitive data
          if (isHarmlessConsoleLog(rule.id, codeWithoutComments)) {
            continue;
          }

          // Calculate confidence with file context
          const confidence = calculateConfidence(
            rule,
            match[0],
            isTestFile,
            codeWithoutComments
          );

          // Skip low confidence findings in test files for secrets category
          if (isTestFile && rule.category === "secrets" && confidence < 70) {
            continue;
          }

          vulnerabilities.push({
            id: rule.id,
            name: rule.name,
            category: rule.category,
            severity:
              isTestFile && rule.category === "secrets" ?
                downgradeTestFileSeverity(rule.severity)
              : rule.severity,
            description:
              isTestFile && rule.category === "secrets" ?
                `${rule.description} (in test file - likely test data)`
              : rule.description,
            line: index + 1,
            column: match.index,
            code: line.trim(),
            cwe: rule.cwe,
            owaspCategory: rule.owasp,
            fixRecommendation: rule.fix,
            references: rule.references,
            confidence,
          });
        }
      });
    } catch (error) {
      logger.error(`Error applying rule ${rule.id}:`, error);
    }
  }

  logger.debug(`Found ${vulnerabilities.length} potential vulnerabilities`);
  return vulnerabilities;
}

/**
 * Check if a match position is inside a regex string (r"..." or r'...')
 * These are typically detection patterns, not actual vulnerabilities
 */
function isInsideRegexString(line: string, matchIndex: number): boolean {
  // Look for Python raw strings: r"..." or r'...'
  const rawStringPattern = /r["'].*?["']/g;
  let match;
  while ((match = rawStringPattern.exec(line)) !== null) {
    if (
      matchIndex >= match.index &&
      matchIndex < match.index + match[0].length
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if file path indicates a test file
 */
function isTestFilePath(filePath: string): boolean {
  const testPatterns = [
    /__tests__/,
    /\.test\./,
    /\.spec\./,
    /test[s]?\//i,
    /spec[s]?\//i,
    /e2e\//i,
    /cypress\//i,
    /playwright\//i,
    /__mocks__/,
    /fixtures?\//i,
    /\.stories\./,
  ];
  return testPatterns.some((pattern) => pattern.test(filePath));
}

/**
 * Downgrade severity for test file findings
 */
function downgradeTestFileSeverity(
  severity: "critical" | "high" | "medium" | "low"
): "critical" | "high" | "medium" | "low" {
  const downgradeMap: Record<string, "critical" | "high" | "medium" | "low"> = {
    critical: "low",
    high: "low",
    medium: "low",
    low: "low",
  };
  return downgradeMap[severity] || severity;
}

/**
 * Check if this is React prop spreading (standard pattern, not a security issue)
 */
function isReactPropSpreading(ruleId: string, line: string): boolean {
  // Only apply to SEC-048 (Unsafe Object Spread from User Input)
  if (ruleId !== "SEC-048") return false;

  // React component prop spreading patterns that are safe
  const safePatterns = [
    /\{\s*\.\.\.\s*props\s*[,}]/i, // {...props}
    /\{\s*\.\.\.\s*rest\s*[,}]/i, // {...rest}
    /\{\s*\.\.\.\s*other\s*[,}]/i, // {...other}
    /\{\s*\.\.\.\s*\w+Props\s*[,}]/i, // {...buttonProps}, {...inputProps}
    /\{\s*\.\.\.\s*field\s*[,}]/i, // {...field} (react-hook-form)
    /\{\s*\.\.\.\s*register\s*[,}]/i, // {...register()} (react-hook-form)
    /\{\s*\.\.\.\s*getInputProps\s*[,}]/i, // {...getInputProps()} (downshift, etc)
    /\{\s*\.\.\.\s*getRootProps\s*[,}]/i, // {...getRootProps()}
  ];

  return safePatterns.some((pattern) => pattern.test(line));
}

/**
 * Check if console.log is harmless (no actual sensitive data)
 */
function isHarmlessConsoleLog(ruleId: string, line: string): boolean {
  // Only apply to SEC-028 (Console Log Sensitive Data)
  if (ruleId !== "SEC-028") return false;

  // Patterns that indicate harmless logging
  const harmlessPatterns = [
    /console\.log\s*\(\s*['"`][^'"`]*['"`]\s*\)/, // Just a string message
    /console\.log\s*\(\s*['"`].*(?:success|complete|done|start|end|init|loaded).*['"`]/i, // Status messages
    /console\.log\s*\(\s*['"`].*(?:error|failed|warning).*['"`]/i, // Error messages (without data)
  ];

  // Check if it's just a simple message without variable interpolation of sensitive data
  if (harmlessPatterns.some((pattern) => pattern.test(line))) {
    // But make sure it doesn't also contain sensitive variable references
    const sensitiveVarPatterns = [
      /\$\{.*(?:token|password|secret|credential|auth).*\}/i,
      /\+\s*(?:token|password|secret|credential|auth)/i,
      /,\s*(?:token|password|secret|credential|auth)\b/i,
    ];
    return !sensitiveVarPatterns.some((pattern) => pattern.test(line));
  }

  return false;
}

/**
 * Check if a match position is inside an error/warning message string
 * These are informational messages, not actual vulnerabilities
 */
function isInsideErrorMessage(line: string, matchIndex: number): boolean {
  // Common patterns for error/warning messages
  const errorPatterns = [
    /["'].*(?:WARNING|ERROR|CRITICAL|SECURITY WARNING|not allowed).*["']/gi,
    /errors\.append\s*\(\s*["'].*["']\s*\)/gi,
    /raise\s+\w+\s*\(\s*["'].*["']\s*\)/gi,
    /logger\.\w+\s*\(\s*["'].*["']\s*\)/gi,
  ];

  for (const pattern of errorPatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(line)) !== null) {
      if (
        matchIndex >= match.index &&
        matchIndex < match.index + match[0].length
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate confidence score for a vulnerability
 */
function calculateConfidence(
  rule: SecurityRule,
  matchedText: string,
  isTestFile: boolean = false,
  fullLine: string = ""
): number {
  let confidence = 80; // Base confidence

  // Increase confidence for critical patterns
  if (rule.severity === "critical") {
    confidence += 10;
  }

  // Increase confidence for specific patterns
  if (matchedText.includes("password") || matchedText.includes("secret")) {
    confidence += 5;
  }

  // Decrease confidence for common false positives
  if (matchedText.includes("test") || matchedText.includes("example")) {
    confidence -= 20;
  }

  // Significantly decrease confidence for test files
  if (isTestFile) {
    confidence -= 30;
  }

  // Decrease confidence for mock/fixture data patterns
  if (fullLine.match(/mock|fixture|stub|fake|dummy|sample/i)) {
    confidence -= 25;
  }

  // Decrease confidence for obvious placeholder values
  if (
    matchedText.match(
      /^['"](?:test|example|demo|sample|placeholder|xxx|abc|123)/i
    )
  ) {
    confidence -= 30;
  }

  return Math.min(95, Math.max(40, confidence));
}

/**
 * Calculate security score (0-100, higher is better)
 */
export function calculateSecurityScore(
  vulnerabilities: SecurityVulnerability[]
): number {
  if (vulnerabilities.length === 0) return 100;

  const weights = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
  };

  let totalDeductions = 0;
  for (const vuln of vulnerabilities) {
    totalDeductions += weights[vuln.severity];
  }

  // Cap at 0
  return Math.max(0, 100 - totalDeductions);
}

/**
 * Group vulnerabilities by category
 */
export function groupByCategory(
  vulnerabilities: SecurityVulnerability[]
): Record<string, SecurityVulnerability[]> {
  const grouped: Record<string, SecurityVulnerability[]> = {};

  for (const vuln of vulnerabilities) {
    if (!grouped[vuln.category]) {
      grouped[vuln.category] = [];
    }
    grouped[vuln.category].push(vuln);
  }

  return grouped;
}

/**
 * Get vulnerability summary
 */
export function getVulnerabilitySummary(
  vulnerabilities: SecurityVulnerability[]
): {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
} {
  return {
    critical: vulnerabilities.filter((v) => v.severity === "critical").length,
    high: vulnerabilities.filter((v) => v.severity === "high").length,
    medium: vulnerabilities.filter((v) => v.severity === "medium").length,
    low: vulnerabilities.filter((v) => v.severity === "low").length,
    total: vulnerabilities.length,
  };
}
