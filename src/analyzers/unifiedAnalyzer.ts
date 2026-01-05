/**
 * Unified Analysis Orchestrator
 * 
 * Combines all analyzers into a single, unified interface
 * Provides comprehensive code analysis in one call
 */

import { buildSymbolTable } from './symbolTable.js';
import { validateReferences } from './referenceValidator.js';
import { scanForVulnerabilities, calculateSecurityScore, getVulnerabilitySummary } from './security/securityScanner.js';
import { detectAntiPatterns, calculateQualityScore, getAntiPatternSummary } from './antiPatternDetector.js';
import { detectLanguage } from './languageDetector.js';
import { logger } from '../utils/logger.js';

export interface UnifiedAnalysisOptions {
  // What to analyze
  checkHallucinations?: boolean;
  checkSecurity?: boolean;
  checkAntiPatterns?: boolean;
  checkComplexity?: boolean;
  
  // Analysis options
  language?: string;
  filePath?: string;
  existingCodebase?: string;
  
  // Filtering
  severityLevel?: 'high' | 'medium' | 'low';
  categories?: string[];
}

export interface UnifiedAnalysisResult {
  success: boolean;
  language: string;
  languageConfidence: number;
  framework?: string;
  
  // Overall scores
  overallScore: number;
  securityScore: number;
  qualityScore: number;
  
  // Issue counts
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  
  // Detailed results
  hallucinations: any[];
  securityVulnerabilities: any[];
  antiPatterns: any[];
  
  // Summaries
  summary: {
    hallucinations: number;
    security: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      total: number;
    };
    antiPatterns: {
      high: number;
      medium: number;
      low: number;
      total: number;
      byCategory: Record<string, number>;
    };
  };
  
  // Metadata
  analysisTime: number;
  timestamp: string;
}

/**
 * Run comprehensive unified analysis
 */
export async function runUnifiedAnalysis(
  code: string,
  options: UnifiedAnalysisOptions = {}
): Promise<UnifiedAnalysisResult> {
  const startTime = Date.now();
  logger.info('Starting unified analysis...');

  // Default options
  const opts = {
    checkHallucinations: true,
    checkSecurity: true,
    checkAntiPatterns: true,
    checkComplexity: false,
    severityLevel: 'low' as const,
    ...options,
  };

  try {
    // Step 1: Detect language if not provided
    let language = opts.language;
    let languageConfidence = 100;
    let framework: string | undefined;

    if (!language) {
      const detection = detectLanguage(code, opts.filePath);
      language = detection.language;
      languageConfidence = detection.confidence;
      framework = detection.framework;
      logger.debug(`Auto-detected language: ${language} (${languageConfidence}% confidence)`);
    }

    // Initialize results
    const hallucinations: any[] = [];
    const securityVulnerabilities: any[] = [];
    const antiPatterns: any[] = [];

    // Step 2: Check for hallucinations
    if (opts.checkHallucinations) {
      logger.debug('Checking for hallucinations...');
      
      // Build symbol table from existing codebase
      const existingSymbols = opts.existingCodebase
        ? await buildSymbolTable(opts.existingCodebase, language)
        : { functions: [], classes: [], variables: [], imports: [], dependencies: [] };

      // Build symbol table from new code
      const newSymbols = await buildSymbolTable(code, language);

      // Combine symbol tables
      const combinedSymbols = {
        functions: [...new Set([...existingSymbols.functions, ...newSymbols.functions])],
        classes: [...new Set([...existingSymbols.classes, ...newSymbols.classes])],
        variables: [...new Set([...existingSymbols.variables, ...newSymbols.variables])],
        imports: [...new Set([...existingSymbols.imports, ...newSymbols.imports])],
        dependencies: [],
      };

      // Validate references
      const issues = await validateReferences(code, combinedSymbols, language);
      hallucinations.push(...issues);
    }

    // Step 3: Security scanning
    if (opts.checkSecurity) {
      logger.debug('Running security scan...');
      const vulnerabilities = await scanForVulnerabilities(code, language, {
        severityLevel: opts.severityLevel,
        categories: opts.categories,
      });
      securityVulnerabilities.push(...vulnerabilities);
    }

    // Step 4: Anti-pattern detection
    if (opts.checkAntiPatterns) {
      logger.debug('Detecting anti-patterns...');
      const patterns = await detectAntiPatterns(code, language, {
        severityLevel: opts.severityLevel,
        categories: opts.categories,
      });
      antiPatterns.push(...patterns);
    }

    // Calculate scores
    const securityScore = calculateSecurityScore(securityVulnerabilities);
    const qualityScore = calculateQualityScore(antiPatterns);
    
    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      (securityScore * 0.4) + 
      (qualityScore * 0.3) + 
      (hallucinations.length === 0 ? 100 : 70) * 0.3
    );

    // Count issues by severity
    const criticalIssues = securityVulnerabilities.filter(v => v.severity === 'critical').length;
    const highIssues = 
      securityVulnerabilities.filter(v => v.severity === 'high').length +
      antiPatterns.filter(p => p.severity === 'high').length +
      hallucinations.filter(h => h.severity === 'high').length;
    const mediumIssues = 
      securityVulnerabilities.filter(v => v.severity === 'medium').length +
      antiPatterns.filter(p => p.severity === 'medium').length;
    const lowIssues = 
      securityVulnerabilities.filter(v => v.severity === 'low').length +
      antiPatterns.filter(p => p.severity === 'low').length;

    const totalIssues = hallucinations.length + securityVulnerabilities.length + antiPatterns.length;

    // Get summaries
    const securitySummary = getVulnerabilitySummary(securityVulnerabilities);
    const antiPatternSummary = getAntiPatternSummary(antiPatterns);

    const analysisTime = Date.now() - startTime;
    logger.info(`Unified analysis completed in ${analysisTime}ms`);

    return {
      success: true,
      language,
      languageConfidence,
      framework,
      
      overallScore,
      securityScore,
      qualityScore,
      
      totalIssues,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
      
      hallucinations,
      securityVulnerabilities,
      antiPatterns,
      
      summary: {
        hallucinations: hallucinations.length,
        security: securitySummary,
        antiPatterns: antiPatternSummary,
      },
      
      analysisTime,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    logger.error('Error in unified analysis:', error);
    throw error;
  }
}

/**
 * Quick analysis (hallucinations only)
 */
export async function quickAnalysis(
  code: string,
  existingCodebase?: string,
  language?: string
): Promise<UnifiedAnalysisResult> {
  return runUnifiedAnalysis(code, {
    checkHallucinations: true,
    checkSecurity: false,
    checkAntiPatterns: false,
    existingCodebase,
    language,
  });
}

/**
 * Security-focused analysis
 */
export async function securityAnalysis(
  code: string,
  language?: string
): Promise<UnifiedAnalysisResult> {
  return runUnifiedAnalysis(code, {
    checkHallucinations: false,
    checkSecurity: true,
    checkAntiPatterns: false,
    language,
    severityLevel: 'low',
  });
}

/**
 * Quality-focused analysis
 */
export async function qualityAnalysis(
  code: string,
  language?: string
): Promise<UnifiedAnalysisResult> {
  return runUnifiedAnalysis(code, {
    checkHallucinations: false,
    checkSecurity: false,
    checkAntiPatterns: true,
    language,
  });
}

/**
 * Full comprehensive analysis
 */
export async function comprehensiveAnalysis(
  code: string,
  existingCodebase?: string,
  language?: string
): Promise<UnifiedAnalysisResult> {
  return runUnifiedAnalysis(code, {
    checkHallucinations: true,
    checkSecurity: true,
    checkAntiPatterns: true,
    existingCodebase,
    language,
  });
}
