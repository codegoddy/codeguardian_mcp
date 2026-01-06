/**
 * Session Diff Analyzer
 * 
 * Tracks changes between code versions to detect hallucinations.
 * Critical for identifying when AI adds references to non-existent code.
 */

import {
  CodeGraph,
  SessionDiff,
  SymbolNode,
  Reference,
  DependencyEdge
} from '../../types/codeGraph.js';
import { ScopeResolver } from './scopeResolver.js';
import { logger } from '../../utils/logger.js';

export class SessionDiffAnalyzer {
  /**
   * Compute diff between two CodeGraphs
   */
  static computeDiff(before: CodeGraph, after: CodeGraph): SessionDiff {
    const diff: SessionDiff = {
      added: [],
      removed: [],
      modified: [],
      newReferences: [],
      brokenReferences: [],
      addedDependencies: [],
      removedDependencies: []
    };

    // Find added symbols
    for (const [name, symbol] of after.symbols) {
      if (!before.symbols.has(name)) {
        diff.added.push(symbol);
      }
    }

    // Find removed symbols
    for (const [name, symbol] of before.symbols) {
      if (!after.symbols.has(name)) {
        diff.removed.push(symbol);
      }
    }

    // Find modified symbols
    for (const [name, afterSymbol] of after.symbols) {
      const beforeSymbol = before.symbols.get(name);
      if (beforeSymbol && this.symbolChanged(beforeSymbol, afterSymbol)) {
        diff.modified.push({
          before: beforeSymbol,
          after: afterSymbol
        });
      }
    }

    // Find new references
    for (const [name, refs] of after.references) {
      const beforeRefs = before.references.get(name) || [];
      const beforeRefSet = new Set(beforeRefs.map(r => this.refKey(r)));
      
      for (const ref of refs) {
        if (!beforeRefSet.has(this.refKey(ref))) {
          diff.newReferences.push(ref);
        }
      }
    }

    // Check if new references are valid (CRITICAL FOR HALLUCINATION DETECTION)
    const resolver = new ScopeResolver(after);
    for (const ref of diff.newReferences) {
      const scope = ref.scope ? after.scopes.get(ref.scope) : after.globalScope;
      if (scope) {
        const resolved = resolver.resolveSymbol(ref.name, scope);
        if (!resolved) {
          diff.brokenReferences.push(ref); // HALLUCINATION DETECTED!
        }
      }
    }

    // Find dependency changes
    const beforeDepSet = new Set(before.dependencies.map(d => this.depKey(d)));
    const afterDepSet = new Set(after.dependencies.map(d => this.depKey(d)));

    for (const dep of after.dependencies) {
      if (!beforeDepSet.has(this.depKey(dep))) {
        diff.addedDependencies.push(dep);
      }
    }

    for (const dep of before.dependencies) {
      if (!afterDepSet.has(this.depKey(dep))) {
        diff.removedDependencies.push(dep);
      }
    }

    logger.debug('Session diff computed:', {
      added: diff.added.length,
      removed: diff.removed.length,
      modified: diff.modified.length,
      newReferences: diff.newReferences.length,
      brokenReferences: diff.brokenReferences.length
    });

    return diff;
  }

  /**
   * Check if symbol changed
   */
  private static symbolChanged(before: SymbolNode, after: SymbolNode): boolean {
    return (
      before.signature !== after.signature ||
      before.returnType !== after.returnType ||
      JSON.stringify(before.parameters) !== JSON.stringify(after.parameters) ||
      before.isAsync !== after.isAsync
    );
  }

  /**
   * Create reference key for comparison
   */
  private static refKey(ref: Reference): string {
    return `${ref.name}:${ref.location.file}:${ref.location.line}:${ref.location.column}`;
  }

  /**
   * Create dependency key for comparison
   */
  private static depKey(dep: DependencyEdge): string {
    return `${dep.from}->${dep.to}:${dep.type}`;
  }

  /**
   * Analyze hallucination risk in diff
   */
  static analyzeHallucinationRisk(diff: SessionDiff): {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    issues: Array<{
      type: string;
      message: string;
      reference?: Reference;
      symbol?: SymbolNode;
    }>;
  } {
    const issues: Array<any> = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Broken references are critical
    if (diff.brokenReferences.length > 0) {
      riskLevel = 'critical';
      for (const ref of diff.brokenReferences) {
        issues.push({
          type: 'broken_reference',
          message: `Reference to non-existent symbol '${ref.name}' at ${ref.location.file}:${ref.location.line}`,
          reference: ref
        });
      }
    }

    // Many new references without definitions is suspicious
    const newRefCount = diff.newReferences.length;
    const newSymbolCount = diff.added.length;
    
    if (newRefCount > newSymbolCount * 3) {
      if (riskLevel === 'low') riskLevel = 'medium';
      issues.push({
        type: 'suspicious_reference_pattern',
        message: `High ratio of new references (${newRefCount}) to new symbols (${newSymbolCount}). Possible hallucination.`
      });
    }

    // References to removed symbols
    for (const ref of diff.newReferences) {
      const removedSymbol = diff.removed.find(s => s.name === ref.name);
      if (removedSymbol) {
        if (riskLevel === 'low' || riskLevel === 'medium') riskLevel = 'high';
        issues.push({
          type: 'reference_to_removed',
          message: `New reference to removed symbol '${ref.name}'`,
          reference: ref,
          symbol: removedSymbol
        });
      }
    }

    // Check for common hallucination patterns
    const hallucinationPatterns = [
      /\.authenticateUser/,
      /\.validateToken/,
      /\.sendEmail/,
      /\.processPayment/,
      /\.getUserData/
    ];

    for (const ref of diff.newReferences) {
      for (const pattern of hallucinationPatterns) {
        if (pattern.test(ref.name)) {
          const isBroken = diff.brokenReferences.some(br => br.name === ref.name);
          if (isBroken && riskLevel !== 'critical') {
            riskLevel = 'high';
            issues.push({
              type: 'common_hallucination_pattern',
              message: `Reference to commonly hallucinated method '${ref.name}'`,
              reference: ref
            });
          }
        }
      }
    }

    return { riskLevel, issues };
  }

  /**
   * Generate human-readable diff report
   */
  static generateReport(diff: SessionDiff): string {
    const lines: string[] = [];
    
    lines.push('=== Session Diff Report ===\n');

    if (diff.added.length > 0) {
      lines.push(`\n✅ Added Symbols (${diff.added.length}):`);
      for (const symbol of diff.added.slice(0, 10)) {
        lines.push(`  + ${symbol.type} ${symbol.name} at ${symbol.location.file}:${symbol.location.line}`);
      }
      if (diff.added.length > 10) {
        lines.push(`  ... and ${diff.added.length - 10} more`);
      }
    }

    if (diff.removed.length > 0) {
      lines.push(`\n❌ Removed Symbols (${diff.removed.length}):`);
      for (const symbol of diff.removed.slice(0, 10)) {
        lines.push(`  - ${symbol.type} ${symbol.name}`);
      }
      if (diff.removed.length > 10) {
        lines.push(`  ... and ${diff.removed.length - 10} more`);
      }
    }

    if (diff.modified.length > 0) {
      lines.push(`\n🔄 Modified Symbols (${diff.modified.length}):`);
      for (const mod of diff.modified.slice(0, 10)) {
        lines.push(`  ~ ${mod.after.type} ${mod.after.name}`);
        if (mod.before.signature !== mod.after.signature) {
          lines.push(`    Signature: ${mod.before.signature} → ${mod.after.signature}`);
        }
      }
    }

    if (diff.brokenReferences.length > 0) {
      lines.push(`\n🚨 BROKEN REFERENCES (${diff.brokenReferences.length}):`);
      for (const ref of diff.brokenReferences) {
        lines.push(`  ⚠️  '${ref.name}' at ${ref.location.file}:${ref.location.line} - NOT FOUND`);
      }
    }

    if (diff.newReferences.length > 0) {
      lines.push(`\n📝 New References (${diff.newReferences.length}):`);
      const validRefs = diff.newReferences.filter(
        r => !diff.brokenReferences.includes(r)
      );
      for (const ref of validRefs.slice(0, 5)) {
        lines.push(`  → ${ref.name}`);
      }
    }

    const risk = this.analyzeHallucinationRisk(diff);
    lines.push(`\n⚠️  Hallucination Risk: ${risk.riskLevel.toUpperCase()}`);
    
    if (risk.issues.length > 0) {
      lines.push('\nIssues:');
      for (const issue of risk.issues) {
        lines.push(`  - ${issue.message}`);
      }
    }

    return lines.join('\n');
  }
}
