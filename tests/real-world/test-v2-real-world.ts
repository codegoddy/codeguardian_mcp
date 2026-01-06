/**
 * Real-world testing of V2 architecture
 */

import { TreeSitterParser } from '../../src/analyzers/parsers/treeSitterParser.js';
import { SemanticIndexBuilder, SemanticQuery } from '../../src/analyzers/parsers/semanticIndex.js';
import { ScopeResolver } from '../../src/analyzers/parsers/scopeResolver.js';
import { PreventHallucinationsV2 } from '../../src/tools/preventHallucinationsV2.js';
import { allSamples } from './ai-generated-samples.js';

interface TestResult {
  name: string;
  codeSize: number;
  parseTime: number;
  hallucinationsDetected: number;
  expectedHallucinations: number;
  accuracy: number;
  details: string[];
}

async function testSample(
  name: string,
  code: string,
  expectedHallucinations: number
): Promise<TestResult> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(70));

  const parser = new TreeSitterParser();
  const startTime = Date.now();

  try {
    // Parse code
    const result = await parser.parse(code, `${name}.ts`, 'typescript');
    const parseTime = Date.now() - startTime;

    console.log(`✅ Parsed in ${parseTime}ms`);
    console.log(`   Symbols found: ${result.graph.symbols.size}`);

    // Build index
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    const query = new SemanticQuery(index, result.graph);

    console.log(`   References tracked: ${result.graph.references.size}`);
    console.log(`   Unresolved references: ${index.unresolvedReferences.length}`);

    // Get detailed hallucinations
    const details: string[] = [];
    const hallucinations = new Set<string>();

    for (const ref of index.unresolvedReferences) {
      const key = `${ref.name}:${ref.location.line}`;
      if (!hallucinations.has(key)) {
        hallucinations.add(key);
        const similar = query.findSimilar(ref.name, 2);
        const suggestion = similar.length > 0
          ? ` (Did you mean '${similar[0].name}'?)`
          : '';
        
        const detail = `   🚨 Line ${ref.location.line}: '${ref.name}' does not exist${suggestion}`;
        details.push(detail);
        console.log(detail);
      }
    }

    const detected = hallucinations.size;
    const accuracy = expectedHallucinations > 0
      ? Math.min(100, (detected / expectedHallucinations) * 100)
      : (detected === 0 ? 100 : 0);

    console.log(`\n   Expected hallucinations: ${expectedHallucinations}`);
    console.log(`   Detected hallucinations: ${detected}`);
    console.log(`   Accuracy: ${accuracy.toFixed(1)}%`);

    return {
      name,
      codeSize: code.length,
      parseTime,
      hallucinationsDetected: detected,
      expectedHallucinations,
      accuracy,
      details
    };
  } catch (error) {
    console.error(`   ❌ Error:`, error);
    throw error;
  }
}

async function runRealWorldTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 REAL-WORLD TESTING - V2 ARCHITECTURE');
  console.log('='.repeat(70));

  const results: TestResult[] = [];

  // Test each sample
  const tests = [
    { name: 'Authentication Service', code: allSamples.authServiceHallucination, expected: 7 },
    { name: 'E-commerce Cart', code: allSamples.ecommerceHallucination, expected: 8 },
    { name: 'API Client', code: allSamples.apiClientHallucination, expected: 7 },
    { name: 'Data Pipeline', code: allSamples.dataPipelineHallucination, expected: 7 },
    { name: 'React Component', code: allSamples.reactHallucination, expected: 5 },
    { name: 'Correct Code', code: allSamples.correctCode, expected: 0 }
  ];

  for (const test of tests) {
    try {
      const result = await testSample(test.name, test.code, test.expected);
      results.push(result);
    } catch (error) {
      console.error(`Failed to test ${test.name}:`, error);
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 SUMMARY REPORT');
  console.log('='.repeat(70));

  const totalExpected = results.reduce((sum, r) => sum + r.expectedHallucinations, 0);
  const totalDetected = results.reduce((sum, r) => sum + r.hallucinationsDetected, 0);
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
  const avgParseTime = results.reduce((sum, r) => sum + r.parseTime, 0) / results.length;
  const totalCodeSize = results.reduce((sum, r) => sum + r.codeSize, 0);

  console.log('\nTest Results:');
  console.log('─'.repeat(70));
  console.log('Sample'.padEnd(30) + 'Parse Time'.padEnd(15) + 'Detected'.padEnd(15) + 'Accuracy');
  console.log('─'.repeat(70));

  for (const result of results) {
    const name = result.name.padEnd(30);
    const parseTime = `${result.parseTime}ms`.padEnd(15);
    const detected = `${result.hallucinationsDetected}/${result.expectedHallucinations}`.padEnd(15);
    const accuracy = `${result.accuracy.toFixed(1)}%`;
    console.log(`${name}${parseTime}${detected}${accuracy}`);
  }

  console.log('─'.repeat(70));
  console.log(`${'AVERAGE'.padEnd(30)}${`${avgParseTime.toFixed(1)}ms`.padEnd(15)}${''.padEnd(15)}${avgAccuracy.toFixed(1)}%`);

  console.log('\n\nPerformance Metrics:');
  console.log(`  • Total code analyzed: ${totalCodeSize} characters`);
  console.log(`  • Average parse time: ${avgParseTime.toFixed(1)}ms`);
  console.log(`  • Parse speed: ${(totalCodeSize / avgParseTime).toFixed(0)} chars/ms`);

  console.log('\n\nHallucination Detection:');
  console.log(`  • Total expected: ${totalExpected}`);
  console.log(`  • Total detected: ${totalDetected}`);
  console.log(`  • Detection rate: ${((totalDetected / totalExpected) * 100).toFixed(1)}%`);
  console.log(`  • Average accuracy: ${avgAccuracy.toFixed(1)}%`);

  console.log('\n\nPerformance Targets:');
  const parseTarget = avgParseTime < 2000;
  const accuracyTarget = avgAccuracy > 80;
  
  console.log(`  ${parseTarget ? '✅' : '❌'} Parse time < 2s: ${avgParseTime.toFixed(1)}ms`);
  console.log(`  ${accuracyTarget ? '✅' : '❌'} Accuracy > 80%: ${avgAccuracy.toFixed(1)}%`);

  // False positives check
  const correctCodeResult = results.find(r => r.name === 'Correct Code');
  if (correctCodeResult) {
    const falsePositives = correctCodeResult.hallucinationsDetected;
    console.log(`  ${falsePositives === 0 ? '✅' : '❌'} No false positives: ${falsePositives} detected`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✨ Real-world testing complete!');
  console.log('='.repeat(70));

  return results;
}

// Run tests
runRealWorldTests().catch(console.error);
