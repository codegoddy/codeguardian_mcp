/**
 * Prevent Hallucinations Tool V2 - With Superior Architecture
 * 
 * Uses CodeGraph, Tree-sitter parsing, semantic indexing, and scope resolution
 * for accurate, fast hallucination detection.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { IncrementalParser } from '../analyzers/parsers/incrementalParser.js';
import { SemanticQuery } from '../analyzers/parsers/semanticIndex.js';
import { ScopeResolver } from '../analyzers/parsers/scopeResolver.js';
import { SessionDiffAnalyzer } from '../analyzers/parsers/sessionDiffAnalyzer.js';
import { CodeGraph, Reference } from '../types/codeGraph.js';
import { logger } from '../utils/logger.js';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';

interface HallucinationReport {
  score: number;
  hallucinationsDetected: Array<{
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    location?: { file: string; line: number; column: number };
    suggestion?: string;
  }>;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  performanceMetrics: {
    parseTime: number;
    analysisTime: number;
    totalTime: number;
  };
}

export class PreventHallucinationsV2 {
  private parser: IncrementalParser;
  private previousGraph?: CodeGraph;

  constructor() {
    this.parser = new IncrementalParser();
  }

  /**
   * Main tool handler
   */
  async handle(args: {
    code: string;
    language: string;
    context?: string;
    previousCode?: string;
  }): Promise<CallToolResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting hallucination detection V2...');

      // Write code to temp file for parsing
      const tempFile = await this.writeTempFile(args.code, args.language);
      
      const parseStartTime = Date.now();
      
      // Parse with incremental parser
      const { graph, index, query } = await this.parser.parseFiles(
        [tempFile],
        args.language
      );
      
      const parseTime = Date.now() - parseStartTime;
      
      const analysisStartTime = Date.now();
      
      // Perform hallucination detection
      const report = await this.detectHallucinations(
        graph,
        query,
        args.language,
        tempFile
      );
      
      const analysisTime = Date.now() - analysisStartTime;
      
      // If we have previous code, compute diff
      if (args.previousCode && this.previousGraph) {
        const diff = SessionDiffAnalyzer.computeDiff(this.previousGraph, graph);
        const diffReport = SessionDiffAnalyzer.generateReport(diff);
        const risk = SessionDiffAnalyzer.analyzeHallucinationRisk(diff);
        
        // Add diff-based hallucinations to report
        for (const issue of risk.issues) {
          report.hallucinationsDetected.push({
            type: issue.type,
            severity: risk.riskLevel === 'critical' ? 'critical' : 'high',
            message: issue.message,
            location: issue.reference ? {
              file: issue.reference.location.file,
              line: issue.reference.location.line,
              column: issue.reference.location.column
            } : undefined
          });
        }
      }

      // Store current graph for next comparison
      this.previousGraph = graph;

      // Update performance metrics
      report.performanceMetrics = {
        parseTime,
        analysisTime,
        totalTime: Date.now() - startTime
      };

      // Update summary counts
      this.updateSummary(report);

      // Clean up temp file
      await this.cleanupTempFile(tempFile);

      // Format response
      return {
        content: [
          {
            type: 'text',
            text: this.formatReport(report)
          }
        ]
      };
    } catch (error) {
      logger.error('Error in hallucination detection:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Detect hallucinations using CodeGraph and semantic analysis
   */
  private async detectHallucinations(
    graph: CodeGraph,
    query: SemanticQuery,
    language: string,
    filePath: string
  ): Promise<HallucinationReport> {
    const hallucinations: HallucinationReport['hallucinationsDetected'] = [];

    // 1. Check for unresolved references
    const unresolvedRefs = query['index'].unresolvedReferences;
    for (const ref of unresolvedRefs) {
      // Find similar symbols for suggestions
      const similar = query.findSimilar(ref.name, 2);
      const suggestion = similar.length > 0
        ? `Did you mean '${similar[0].name}'?`
        : 'Symbol not found in codebase';

      hallucinations.push({
        type: 'unresolved_reference',
        severity: 'critical',
        message: `Reference to non-existent symbol '${ref.name}'`,
        location: {
          file: ref.location.file,
          line: ref.location.line,
          column: ref.location.column
        },
        suggestion
      });
    }

    // 2. Check for invalid method calls
    await this.checkMethodCalls(graph, hallucinations, filePath);

    // 3. Check for invalid imports
    await this.checkImports(graph, hallucinations, language);

    // 4. Check for type mismatches
    await this.checkTypeMismatches(graph, query, hallucinations);

    // 5. Check for common hallucination patterns
    this.checkCommonPatterns(graph, hallucinations);

    // 6. Check for dead/unused code
    const unused = query.findDeadCode();
    if (unused.length > 5) { // Only report if significant
      hallucinations.push({
        type: 'excessive_unused_code',
        severity: 'medium',
        message: `Found ${unused.length} unused symbols. AI may have generated unnecessary code.`
      });
    }

    // Calculate score
    const score = this.calculateScore(hallucinations);

    return {
      score,
      hallucinationsDetected: hallucinations,
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      performanceMetrics: { parseTime: 0, analysisTime: 0, totalTime: 0 }
    };
  }

  /**
   * Check method calls for validity
   */
  private async checkMethodCalls(
    graph: CodeGraph,
    hallucinations: HallucinationReport['hallucinationsDetected'],
    filePath: string
  ): Promise<void> {
    const resolver = new ScopeResolver(graph);
    const fileScope = graph.scopes.get(filePath);
    
    if (!fileScope) return;

    // Find all method call references
    for (const [name, refs] of graph.references) {
      if (name.includes('.')) {
        // This is a method call like "obj.method"
        const [objectName, methodName] = name.split('.');
        
        for (const ref of refs) {
          const scope = graph.scopes.get(ref.scope || filePath) || fileScope;
          const resolved = resolver.resolveMethodCall(objectName, methodName, scope);
          
          if (!resolved) {
            hallucinations.push({
              type: 'invalid_method_call',
              severity: 'critical',
              message: `Method '${methodName}' does not exist on object '${objectName}'`,
              location: {
                file: ref.location.file,
                line: ref.location.line,
                column: ref.location.column
              },
              suggestion: `Check if '${objectName}' has the method '${methodName}'`
            });
          }
        }
      }
    }
  }

  /**
   * Check imports for validity
   */
  private async checkImports(
    graph: CodeGraph,
    hallucinations: HallucinationReport['hallucinationsDetected'],
    language: string
  ): Promise<void> {
    for (const [filePath, importNode] of graph.imports) {
      // Check if imported module exists (for relative imports)
      if (importNode.module.startsWith('.')) {
        const resolvedPath = this.resolveImportPath(filePath, importNode.module, language);
        
        try {
          await fs.access(resolvedPath);
        } catch {
          hallucinations.push({
            type: 'invalid_import',
            severity: 'critical',
            message: `Import '${importNode.module}' cannot be resolved`,
            location: {
              file: importNode.location.file,
              line: importNode.location.line,
              column: importNode.location.column
            },
            suggestion: 'Check if the imported module path is correct'
          });
        }
      }
    }
  }

  /**
   * Check for type mismatches
   */
  private async checkTypeMismatches(
    graph: CodeGraph,
    query: SemanticQuery,
    hallucinations: HallucinationReport['hallucinationsDetected']
  ): Promise<void> {
    // Check function calls with wrong number of arguments
    for (const [funcName, callees] of graph.callGraph) {
      const funcSymbol = query.findSymbol(funcName);
      if (!funcSymbol || !funcSymbol.parameters) continue;

      // This is a simplified check - full implementation would parse call sites
      // and count actual arguments passed
    }
  }

  /**
   * Check for common AI hallucination patterns
   */
  private checkCommonPatterns(
    graph: CodeGraph,
    hallucinations: HallucinationReport['hallucinationsDetected']
  ): void {
    // Common method names that AI often hallucinates
    const commonHallucinations = [
      'authenticateUser',
      'validateToken',
      'sendEmail',
      'processPayment',
      'getUserData',
      'updateDatabase',
      'connectToAPI',
      'fetchData',
      'saveToFile',
      'encryptPassword'
    ];

    for (const [name, refs] of graph.references) {
      // Check if this is a commonly hallucinated method
      const methodName = name.split('.').pop() || name;
      
      if (commonHallucinations.includes(methodName)) {
        // Check if it actually exists
        const exists = graph.symbols.has(name) || graph.symbols.has(methodName);
        
        if (!exists) {
          for (const ref of refs) {
            hallucinations.push({
              type: 'common_hallucination_pattern',
              severity: 'high',
              message: `Reference to commonly hallucinated method '${methodName}'`,
              location: {
                file: ref.location.file,
                line: ref.location.line,
                column: ref.location.column
              },
              suggestion: `AI often invents common method names. Verify '${methodName}' exists.`
            });
          }
        }
      }
    }
  }

  /**
   * Calculate hallucination score (0-100, higher is better)
   */
  private calculateScore(
    hallucinations: HallucinationReport['hallucinationsDetected']
  ): number {
    let deductions = 0;

    for (const h of hallucinations) {
      switch (h.severity) {
        case 'critical':
          deductions += 20;
          break;
        case 'high':
          deductions += 10;
          break;
        case 'medium':
          deductions += 5;
          break;
        case 'low':
          deductions += 2;
          break;
      }
    }

    return Math.max(0, 100 - deductions);
  }

  /**
   * Update summary counts
   */
  private updateSummary(report: HallucinationReport): void {
    report.summary.total = report.hallucinationsDetected.length;
    report.summary.critical = report.hallucinationsDetected.filter(h => h.severity === 'critical').length;
    report.summary.high = report.hallucinationsDetected.filter(h => h.severity === 'high').length;
    report.summary.medium = report.hallucinationsDetected.filter(h => h.severity === 'medium').length;
    report.summary.low = report.hallucinationsDetected.filter(h => h.severity === 'low').length;
  }

  /**
   * Format report as readable text
   */
  private formatReport(report: HallucinationReport): string {
    const lines: string[] = [];

    lines.push('=== HALLUCINATION DETECTION REPORT V2 ===\n');
    lines.push(`Score: ${report.score}/100 ${this.getScoreEmoji(report.score)}\n`);

    if (report.hallucinationsDetected.length === 0) {
      lines.push('✅ No hallucinations detected! Code looks good.\n');
    } else {
      lines.push(`⚠️  ${report.summary.total} issues detected:\n`);
      lines.push(`   - Critical: ${report.summary.critical}`);
      lines.push(`   - High: ${report.summary.high}`);
      lines.push(`   - Medium: ${report.summary.medium}`);
      lines.push(`   - Low: ${report.summary.low}\n`);

      // Group by severity
      const bySeverity = {
        critical: report.hallucinationsDetected.filter(h => h.severity === 'critical'),
        high: report.hallucinationsDetected.filter(h => h.severity === 'high'),
        medium: report.hallucinationsDetected.filter(h => h.severity === 'medium'),
        low: report.hallucinationsDetected.filter(h => h.severity === 'low')
      };

      for (const [severity, issues] of Object.entries(bySeverity)) {
        if (issues.length === 0) continue;

        lines.push(`\n${this.getSeverityEmoji(severity as any)} ${severity.toUpperCase()} (${issues.length}):`);
        
        for (const issue of issues) {
          const location = issue.location 
            ? ` at ${issue.location.file}:${issue.location.line}:${issue.location.column}`
            : '';
          lines.push(`  • ${issue.message}${location}`);
          if (issue.suggestion) {
            lines.push(`    💡 ${issue.suggestion}`);
          }
        }
      }
    }

    lines.push('\n📊 Performance:');
    lines.push(`   - Parse time: ${report.performanceMetrics.parseTime}ms`);
    lines.push(`   - Analysis time: ${report.performanceMetrics.analysisTime}ms`);
    lines.push(`   - Total time: ${report.performanceMetrics.totalTime}ms`);

    return lines.join('\n');
  }

  private getScoreEmoji(score: number): string {
    if (score >= 90) return '🟢';
    if (score >= 70) return '🟡';
    if (score >= 50) return '🟠';
    return '🔴';
  }

  private getSeverityEmoji(severity: 'critical' | 'high' | 'medium' | 'low'): string {
    const emojis = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️'
    };
    return emojis[severity];
  }

  private resolveImportPath(fromFile: string, importPath: string, language: string): string {
    const dir = path.dirname(fromFile);
    const ext = language === 'typescript' ? '.ts' : language === 'javascript' ? '.js' : '.py';
    
    let resolved = path.resolve(dir, importPath);
    if (!resolved.endsWith(ext)) {
      resolved += ext;
    }
    
    return resolved;
  }

  private async writeTempFile(code: string, language: string): Promise<string> {
    const ext = language === 'typescript' ? '.ts' : language === 'javascript' ? '.js' : '.py';
    const tempFile = path.join(process.cwd(), `tmp_rovodev_hallucination_check${ext}`);
    await fs.writeFile(tempFile, code, 'utf-8');
    return tempFile;
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      logger.warn(`Failed to cleanup temp file: ${filePath}`);
    }
  }
}
