
import { getProjectContext } from "../../src/context/projectContext.js";
import { buildSymbolGraph } from "../../src/analyzers/symbolGraph.js";
import { ImpactAnalyzer } from "../../src/analyzers/impactAnalyzer.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

async function testSemanticBridge() {
  const tempDir = path.join(os.tmpdir(), "codeguardian-bridge-test");
  await fs.mkdir(tempDir, { recursive: true });
  
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  // 1. Create Python backend with a route
  const pythonFile = path.join(srcDir, "api.py");
  await fs.writeFile(pythonFile, `
from flask import Flask
app = Flask(__name__)

@app.route("/api/user")
def get_user():
    return {"id": 1, "name": "Vibe Hacker"}
`);

  // 2. Create TypeScript frontend that calls the route
  const tsFile = path.join(srcDir, "Client.ts");
  await fs.writeFile(tsFile, `
async function fetchData() {
    const res = await fetch("/api/user");
    const data = await res.json();
    return data;
}
`);

  console.log("Fixtures created. Building context...");

  // 3. Build context
  const context = await getProjectContext(tempDir, {
    language: "all",
    includeTests: false,
    maxFiles: 100
  });

  console.log(`Context built. Files: ${context.files.size}`);
  
  // 4. Verify route symbol extraction
  const routeSymbols = Array.from(context.symbolIndex.keys()).filter(s => s === "/api/user");
  console.log("Route symbols found:", routeSymbols);

  if (routeSymbols.length === 0) {
    throw new Error("Route symbol '/api/user' not found in symbol index");
  }

  // 5. Build symbol graph
  context.symbolGraph = await buildSymbolGraph(context as any, {
    includeCallRelationships: true,
    includeCoOccurrence: false
  });

  const relationships = context.symbolGraph.relationships.filter(r => r.to === "/api/user");
  console.log("Relationships to route:", relationships.map(r => `${r.from} -> ${r.to} (${r.reason})`));

  if (relationships.length === 0) {
    throw new Error("Semantic Bridge relationship not found in graph");
  }

  // 6. Trace blast radius
  const analyzer = new ImpactAnalyzer();
  const blast = analyzer.traceBlastRadius("/api/user", context.symbolGraph);
  
  console.log("Blast Radius for '/api/user':");
  console.log(`Affected Files: ${blast.affectedFiles.join(", ")}`);
  
  if (!blast.affectedFiles.some(f => f.includes("Client.ts"))) {
    throw new Error("Blast radius failed to trace from Python route to TS client");
  }

  console.log("SUCCESS: Semantic Bridge verified!");
  
  // Cleanup
  await fs.rm(tempDir, { recursive: true });
}

testSemanticBridge().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
