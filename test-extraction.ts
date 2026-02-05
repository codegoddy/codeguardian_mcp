/**
 * Debug API Contract Guardian on Report Directory
 */

import * as fs from "fs/promises";
import { getParser } from "./dist/tools/validation/parser.js";

const TEST_FILE = "./report/frontend/src/services/clients.ts";

async function testExtraction() {
  console.log("🔍 Testing Service Extraction\n");

  const content = await fs.readFile(TEST_FILE, "utf-8");
  console.log("File content (first 500 chars):");
  console.log(content.slice(0, 500));
  console.log("\n" + "=".repeat(80) + "\n");

  // Test regex pattern
  const lines = content.split("\n");
  console.log("Testing regex patterns on each line:\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Old pattern
    const oldMatch = line.match(
      /(?:api|axios|client|[A-Za-z]+Api|[A-Za-z]+Service)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/i,
    );

    // New pattern with generic support
    const newMatch = line.match(
      /(?:api|axios|client|[A-Za-z]+Api|[A-Za-z]+Service)\.(get|post|put|patch|delete)(?:<[^\u003e]+\u003e)?\s*\(\s*["'`]([^"'`]+)["'`]/i,
    );

    if (oldMatch || newMatch) {
      console.log(`Line ${i + 1}: ${line.slice(0, 80)}...`);
      console.log(`  Old pattern: ${oldMatch ? "✅ MATCH" : "❌ no match"}`);
      console.log(`  New pattern: ${newMatch ? "✅ MATCH" : "❌ no match"}`);
      if (newMatch) {
        console.log(`  Method: ${newMatch[1]}, Endpoint: ${newMatch[2]}`);
      }
      console.log("");
    }
  }
}

testExtraction();
