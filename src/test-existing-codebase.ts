/**
 * Test V2 architecture on our existing codebase
 *
 * @format
 */

import { IncrementalParser } from "./analyzers/parsers/incrementalParser.js";
import { SemanticIndexBuilder } from "./analyzers/parsers/semanticIndex.js";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";

async function testExistingCodebase() {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 TESTING ON EXISTING CODEBASE");
  console.log("=".repeat(70));

  // Find TypeScript files in src directory
  const files = await glob("src/**/*.ts", {
    ignore: ["src/test-*.ts", "node_modules/**", "dist/**"],
  });

  console.log(`\nFound ${files.length} TypeScript files to analyze\n`);

  const parser = new IncrementalParser();

  // First parse (cold)
  console.log("⏱️  First parse (cold cache)...");
  const startCold = Date.now();
  const { graph, index, query } = await parser.parseFiles(files, "typescript");
  const coldTime = Date.now() - startCold;

  console.log(`✅ Parsed in ${coldTime}ms\n`);

  // Statistics
  const stats = SemanticIndexBuilder.getStatistics(index);

  console.log("📊 Codebase Statistics:");
  console.log(`  • Files analyzed: ${files.length}`);
  console.log(`  • Total symbols: ${stats.totalSymbols}`);
  console.log(`  • Functions: ${stats.symbolsByType.function || 0}`);
  console.log(`  • Classes: ${stats.symbolsByType.class || 0}`);
  console.log(`  • Variables: ${stats.symbolsByType.variable || 0}`);
  console.log(`  • Methods: ${stats.symbolsByType.method || 0}`);
  console.log(`  • Unused symbols: ${stats.unusedCount}`);
  console.log(`  • Unresolved references: ${stats.unresolvedCount}`);

  // Test incremental parsing
  console.log("\n⏱️  Second parse (warm cache)...");
  const startWarm = Date.now();
  await parser.parseFiles(files, "typescript");
  const warmTime = Date.now() - startWarm;

  console.log(`✅ Parsed in ${warmTime}ms`);
  console.log(`🚀 Speedup: ${(coldTime / warmTime).toFixed(1)}x faster\n`);

  // Test queries
  console.log("🔍 Testing O(1) Queries:");

  const testQueries = [
    "PreventHallucinationsV2",
    "TreeSitterParser",
    "SemanticIndexBuilder",
    "CodeGraph",
    "SymbolNode",
  ];

  let totalQueryTime = 0;
  for (const symbolName of testQueries) {
    const queryStart = Date.now();
    const symbol = query.findSymbol(symbolName);
    const queryTime = Date.now() - queryStart;
    totalQueryTime += queryTime;

    if (symbol) {
      console.log(
        `  ✅ Found '${symbolName}' in ${queryTime}ms (${symbol.type})`
      );
    } else {
      console.log(`  ❌ '${symbolName}' not found (${queryTime}ms)`);
    }
  }

  const avgQueryTime = totalQueryTime / testQueries.length;
  console.log(`\n  Average query time: ${avgQueryTime.toFixed(2)}ms`);

  // Analyze each file
  console.log("\n\n📁 Per-File Analysis:");
  console.log("─".repeat(70));
  console.log(
    "File".padEnd(40) + "Symbols".padEnd(10) + "Unresolved".padEnd(15)
  );
  console.log("─".repeat(70));

  const fileStats = [];
  for (const file of files.slice(0, 10)) {
    // Show top 10
    const fileSymbols = index.symbolsByFile.get(file) || [];
    const unresolvedInFile = index.unresolvedReferences.filter(
      (ref) => ref.location.file === file
    ).length;

    const fileName = path.basename(file).padEnd(40);
    const symbolCount = fileSymbols.length.toString().padEnd(10);
    const unresolvedCount = unresolvedInFile.toString().padEnd(15);

    console.log(`${fileName}${symbolCount}${unresolvedCount}`);

    fileStats.push({
      file,
      symbols: fileSymbols.length,
      unresolved: unresolvedInFile,
    });
  }

  if (files.length > 10) {
    console.log(`... and ${files.length - 10} more files`);
  }

  // Performance targets
  console.log("\n\n✅ Performance Validation:");
  const parsePerFile = coldTime / files.length;
  console.log(
    `  ${parsePerFile < 2000 ? "✅" : "❌"} Parse time < 2s per file: ${parsePerFile.toFixed(1)}ms`
  );
  console.log(
    `  ${avgQueryTime < 1 ? "✅" : "❌"} Query time < 1ms: ${avgQueryTime.toFixed(2)}ms`
  );
  console.log(
    `  ${warmTime < coldTime / 10 ? "✅" : "❌"} Incremental speedup > 10x: ${(coldTime / warmTime).toFixed(1)}x`
  );

  // Dead code detection
  const deadCode = query.findDeadCode();
  if (deadCode.length > 0) {
    console.log(`\n\n💀 Dead Code Detected (${deadCode.length} symbols):`);
    for (const symbol of deadCode.slice(0, 5)) {
      console.log(
        `  • ${symbol.type} '${symbol.name}' at ${symbol.location.file}:${symbol.location.line}`
      );
    }
    if (deadCode.length > 5) {
      console.log(`  ... and ${deadCode.length - 5} more`);
    }
  }

  // Call graph analysis
  console.log("\n\n📞 Call Graph Sample:");
  const functions = stats.symbolsByType.function || 0;
  const callGraphSize = graph.callGraph.size;
  console.log(`  • Total functions: ${functions}`);
  console.log(`  • Functions with calls: ${callGraphSize}`);

  // Show some call relationships
  let callSamples = 0;
  for (const [caller, callees] of graph.callGraph.entries()) {
    if (callSamples >= 5) break;
    if (callees.length > 0) {
      console.log(
        `  • '${caller}' calls: ${callees.slice(0, 3).join(", ")}${callees.length > 3 ? "..." : ""}`
      );
      callSamples++;
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("✨ Codebase analysis complete!");
  console.log("=".repeat(70));

  return {
    files: files.length,
    symbols: stats.totalSymbols,
    coldTime,
    warmTime,
    avgQueryTime,
    deadCode: deadCode.length,
  };
}

testExistingCodebase().catch(console.error);
