/**
 * Performance Benchmark for Superior Architecture
 * 
 * Measures parsing speed, index building, and query performance.
 */

import { TreeSitterParser } from '../src/analyzers/parsers/treeSitterParser';
import { SemanticIndexBuilder, SemanticQuery } from '../src/analyzers/parsers/semanticIndex';
import { IncrementalParser } from '../src/analyzers/parsers/incrementalParser';
import * as fs from 'fs/promises';
import * as path from 'path';

interface BenchmarkResult {
  name: string;
  fileSize: number;
  linesOfCode: number;
  parseTime: number;
  indexTime: number;
  queryTime: number;
  totalTime: number;
  symbolsFound: number;
  referencesFound: number;
}

async function benchmarkFile(filePath: string, language: string): Promise<BenchmarkResult> {
  const code = await fs.readFile(filePath, 'utf-8');
  const fileSize = code.length;
  const linesOfCode = code.split('\n').length;

  const parser = new TreeSitterParser();
  
  // Measure parsing
  const parseStart = Date.now();
  const result = await parser.parse(code, filePath, language);
  const parseTime = Date.now() - parseStart;

  // Measure indexing
  const indexStart = Date.now();
  const index = SemanticIndexBuilder.buildIndex(result.graph);
  const indexTime = Date.now() - indexStart;

  // Measure queries
  const query = new SemanticQuery(index, result.graph);
  const queryStart = Date.now();
  
  // Run various queries
  const stats = query.getStatistics();
  query.findDeadCode();
  query.findByPattern(/test/i);
  
  const queryTime = Date.now() - queryStart;

  return {
    name: path.basename(filePath),
    fileSize,
    linesOfCode,
    parseTime,
    indexTime,
    queryTime,
    totalTime: parseTime + indexTime + queryTime,
    symbolsFound: stats.totalSymbols,
    referencesFound: index.referencesTo.size
  };
}

async function benchmarkIncremental(): Promise<void> {
  console.log('\n=== INCREMENTAL PARSING BENCHMARK ===\n');

  const parser = new IncrementalParser();
  
  // First parse
  const files = [
    'src/server.ts',
    'src/tools/preventHallucinations.ts',
    'src/analyzers/symbolTable.ts'
  ];

  const firstParseStart = Date.now();
  await parser.parseFiles(files, 'typescript');
  const firstParseTime = Date.now() - firstParseStart;

  console.log(`First parse (cold): ${firstParseTime}ms`);

  // Second parse (cached)
  const secondParseStart = Date.now();
  await parser.parseFiles(files, 'typescript');
  const secondParseTime = Date.now() - secondParseStart;

  console.log(`Second parse (cached): ${secondParseTime}ms`);
  console.log(`Speedup: ${(firstParseTime / secondParseTime).toFixed(2)}x faster`);

  const cacheStats = parser.getCacheStats();
  console.log(`Cache size: ${cacheStats.size} files`);
}

async function runBenchmarks(): Promise<void> {
  console.log('=== CODEGUARDIAN V2 PERFORMANCE BENCHMARK ===\n');

  const testFiles = [
    { path: 'src/server.ts', language: 'typescript' },
    { path: 'src/tools/preventHallucinations.ts', language: 'typescript' },
    { path: 'src/analyzers/symbolTable.ts', language: 'typescript' },
    { path: 'src/analyzers/referenceValidator.ts', language: 'typescript' }
  ];

  const results: BenchmarkResult[] = [];

  for (const { path: filePath, language } of testFiles) {
    try {
      console.log(`Benchmarking: ${filePath}...`);
      const result = await benchmarkFile(filePath, language);
      results.push(result);
      
      console.log(`  ✓ Parsed ${result.linesOfCode} lines in ${result.parseTime}ms`);
      console.log(`  ✓ Indexed in ${result.indexTime}ms`);
      console.log(`  ✓ Found ${result.symbolsFound} symbols\n`);
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===\n');
  
  const totalLines = results.reduce((sum, r) => sum + r.linesOfCode, 0);
  const totalParseTime = results.reduce((sum, r) => sum + r.parseTime, 0);
  const totalSymbols = results.reduce((sum, r) => sum + r.symbolsFound, 0);
  
  console.log(`Total files: ${results.length}`);
  console.log(`Total lines: ${totalLines}`);
  console.log(`Total parse time: ${totalParseTime}ms`);
  console.log(`Average: ${(totalParseTime / results.length).toFixed(2)}ms per file`);
  console.log(`Speed: ${(totalLines / (totalParseTime / 1000)).toFixed(0)} lines/second`);
  console.log(`Total symbols: ${totalSymbols}`);

  // Performance targets
  console.log('\n=== PERFORMANCE TARGETS ===\n');
  const avgParseTime = totalParseTime / results.length;
  console.log(`Code analysis: ${avgParseTime < 2000 ? '✅' : '❌'} Target: < 2s per file (Actual: ${(avgParseTime / 1000).toFixed(2)}s)`);
  
  const avgIndexTime = results.reduce((sum, r) => sum + r.indexTime, 0) / results.length;
  console.log(`Index building: ${avgIndexTime < 100 ? '✅' : '❌'} Target: < 100ms (Actual: ${avgIndexTime.toFixed(0)}ms)`);
  
  const avgQueryTime = results.reduce((sum, r) => sum + r.queryTime, 0) / results.length;
  console.log(`Symbol lookup: ${avgQueryTime < 5 ? '✅' : '❌'} Target: < 5ms (Actual: ${avgQueryTime.toFixed(2)}ms)`);

  // Test incremental parsing
  await benchmarkIncremental();

  // Detailed table
  console.log('\n=== DETAILED RESULTS ===\n');
  console.log('File                          | LOC  | Parse  | Index | Query | Total  | Symbols');
  console.log('-'.repeat(90));
  
  for (const r of results) {
    const name = r.name.padEnd(30);
    const loc = r.linesOfCode.toString().padStart(4);
    const parse = `${r.parseTime}ms`.padStart(6);
    const index = `${r.indexTime}ms`.padStart(5);
    const query = `${r.queryTime}ms`.padStart(5);
    const total = `${r.totalTime}ms`.padStart(6);
    const symbols = r.symbolsFound.toString().padStart(7);
    
    console.log(`${name} | ${loc} | ${parse} | ${index} | ${query} | ${total} | ${symbols}`);
  }
}

// Run benchmarks
runBenchmarks().catch(console.error);
