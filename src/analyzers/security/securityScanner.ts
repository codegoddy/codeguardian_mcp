/**
 * Security Scanner
 * 
 * Scans code for security vulnerabilities using pattern matching
 * Covers OWASP Top 10 and AI-specific security risks
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SecurityVulnerability {
  id: string;
  name: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
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
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  pattern: string;
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
      join(__dirname, '../../../rules/security/security-patterns.json'),
      join(process.cwd(), 'rules/security/security-patterns.json'),
    ];

    for (const rulesPath of generalPaths) {
      try {
        const rulesData = readFileSync(rulesPath, 'utf-8');
        const parsed = JSON.parse(rulesData);
        allRules.push(...(parsed.rules || []));
        logger.debug(`Loaded ${parsed.rules?.length || 0} general security rules from ${rulesPath}`);
        break;
      } catch (err) {
        continue;
      }
    }

    // Load language-specific rules if specified
    if (language === 'python') {
      const pythonPaths = [
        join(__dirname, '../../../rules/security/python-security-patterns.json'),
        join(process.cwd(), 'rules/security/python-security-patterns.json'),
      ];

      for (const rulesPath of pythonPaths) {
        try {
          const rulesData = readFileSync(rulesPath, 'utf-8');
          const parsed = JSON.parse(rulesData);
          allRules.push(...(parsed.rules || []));
          logger.debug(`Loaded ${parsed.rules?.length || 0} Python security rules from ${rulesPath}`);
          break;
        } catch (err) {
          continue;
        }
      }
    }

    if (allRules.length === 0) {
      logger.error('Could not find security rules file in any expected location');
    }

    return allRules;
  } catch (error) {
    logger.error('Error loading security rules:', error);
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
    severityLevel?: 'critical' | 'high' | 'medium' | 'low';
    categories?: string[];
  } = {}
): Promise<SecurityVulnerability[]> {
  logger.debug(`Scanning code for security vulnerabilities (${language})...`);

  const vulnerabilities: SecurityVulnerability[] = [];
  const rules = loadSecurityRules(language);

  // Filter rules by severity if specified
  const filteredRules = rules.filter(rule => {
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

  const lines = code.split('\n');

  // Scan each rule
  for (const rule of filteredRules) {
    try {
      const pattern = new RegExp(rule.pattern, 'gi');
      
      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        // Skip comment lines
        if (trimmedLine.startsWith('//') || 
            trimmedLine.startsWith('/*') || 
            trimmedLine.startsWith('*') ||
            trimmedLine.startsWith('#')) {
          return;
        }

        // Remove inline comments
        const codeWithoutComments = line.split('//')[0];
        
        let match;
        pattern.lastIndex = 0; // Reset regex
        while ((match = pattern.exec(codeWithoutComments)) !== null) {
          vulnerabilities.push({
            id: rule.id,
            name: rule.name,
            category: rule.category,
            severity: rule.severity,
            description: rule.description,
            line: index + 1,
            column: match.index,
            code: line.trim(),
            cwe: rule.cwe,
            owaspCategory: rule.owasp,
            fixRecommendation: rule.fix,
            references: rule.references,
            confidence: calculateConfidence(rule, match[0]),
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
 * Calculate confidence score for a vulnerability
 */
function calculateConfidence(rule: SecurityRule, matchedText: string): number {
  let confidence = 80; // Base confidence

  // Increase confidence for critical patterns
  if (rule.severity === 'critical') {
    confidence += 10;
  }

  // Increase confidence for specific patterns
  if (matchedText.includes('password') || matchedText.includes('secret')) {
    confidence += 5;
  }

  // Decrease confidence for common false positives
  if (matchedText.includes('test') || matchedText.includes('example')) {
    confidence -= 20;
  }

  return Math.min(95, Math.max(60, confidence));
}

/**
 * Calculate security score (0-100, higher is better)
 */
export function calculateSecurityScore(vulnerabilities: SecurityVulnerability[]): number {
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
export function groupByCategory(vulnerabilities: SecurityVulnerability[]): Record<string, SecurityVulnerability[]> {
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
export function getVulnerabilitySummary(vulnerabilities: SecurityVulnerability[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
} {
  return {
    critical: vulnerabilities.filter(v => v.severity === 'critical').length,
    high: vulnerabilities.filter(v => v.severity === 'high').length,
    medium: vulnerabilities.filter(v => v.severity === 'medium').length,
    low: vulnerabilities.filter(v => v.severity === 'low').length,
    total: vulnerabilities.length,
  };
}
