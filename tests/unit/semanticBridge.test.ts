
import { getProjectContext } from "../../src/context/projectContext.js";
import { buildSymbolGraph } from "../../src/analyzers/symbolGraph.js";
import { ImpactAnalyzer } from "../../src/analyzers/impactAnalyzer.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { describe, expect, test } from "vitest";

describe("Semantic Bridge", () => {
  // This test builds a tiny mixed-language project and verifies that:
  // 1) Python route symbols are indexed
  // 2) The TS client calling that route is linked via the symbol graph
  // 3) Blast radius includes the TS client file
  test("should link backend route to frontend caller", async () => {

    const tempDir = path.join(os.tmpdir(), `codeguardian-bridge-test-${Date.now()}`);
    const srcDir = path.join(tempDir, "src");

    await fs.mkdir(srcDir, { recursive: true });

    // 1) Create Python backend with a route
    const pythonFile = path.join(srcDir, "api.py");
    await fs.writeFile(
      pythonFile,
      `
from flask import Flask
app = Flask(__name__)

@app.route("/api/user")
def get_user():
    return {"id": 1, "name": "Vibe Hacker"}
`,
    );

    // 2) Create TypeScript frontend that calls the route
    const tsFile = path.join(srcDir, "Client.ts");
    await fs.writeFile(
      tsFile,
      `
async function fetchData() {
    const res = await fetch("/api/user");
    const data = await res.json();
    return data;
}
`,
    );

    try {
      // 3) Build context
      const context = await getProjectContext(tempDir, {
        language: "all",
        includeTests: false,
        maxFiles: 100,
      });

      // 4) Verify route symbol extraction
      const hasRouteSymbol = context.symbolIndex.has("/api/user");
      expect(hasRouteSymbol).toBe(true);

      // 5) Build symbol graph
      context.symbolGraph = await buildSymbolGraph(context as any, {
        includeCallRelationships: true,
        includeCoOccurrence: false,
      });

      const relationships = context.symbolGraph.relationships.filter(
        (r) => r.to === "/api/user",
      );
      expect(relationships.length).toBeGreaterThan(0);

      // 6) Trace blast radius
      const analyzer = new ImpactAnalyzer();
      const blast = analyzer.traceBlastRadius("/api/user", context.symbolGraph);
      expect(blast.affectedFiles.some((f) => f.includes("Client.ts"))).toBe(true);
    } finally {
      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 60000);
});
