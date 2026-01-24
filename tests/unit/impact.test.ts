/**
 * Impact Analyzer Tests
 * 
 * Verifies Secret #6 (Semantic Ripples):
 * 1. Blast Radius Tracing: Recursively find downstream consumers.
 * 2. Severity Calculation: Verify low/medium/high thresholds.
 * 
 * @format
 */

import { ImpactAnalyzer } from "../../src/analyzers/impactAnalyzer.js";
import { SymbolGraph } from "../../src/types/symbolGraph.js";

describe("Secret #6: Change Impact Analyzer (Semantic Ripples)", () => {
  let analyzer: ImpactAnalyzer;
  let mockGraph: SymbolGraph;

  beforeEach(() => {
    analyzer = new ImpactAnalyzer();
    
    // Setup a recursive dependency graph:
    // API_CORE  <--  UserModule  <--  AuthService  <--  LoginForm
    mockGraph = {
      usage: new Map([
        ["API_CORE", { usageCount: 1, importCount: 0, calledBy: new Set(["/src/UserModule.ts"]), coOccurs: new Map() }],
        ["UserModule", { usageCount: 1, importCount: 0, calledBy: new Set(["/src/AuthService.ts"]), coOccurs: new Map() }],
        ["AuthService", { usageCount: 1, importCount: 0, calledBy: new Set(["/src/LoginForm.tsx"]), coOccurs: new Map() }],
      ]),
      relationships: [
        { from: "UserModule", to: "API_CORE", type: "calls", file: "/src/UserModule.ts", confidence: 1, reason: "AST-based call" },
        { from: "AuthService", to: "UserModule", type: "calls", file: "/src/AuthService.ts", confidence: 1, reason: "AST-based call" },
        { from: "LoginForm", to: "AuthService", type: "calls", file: "/src/LoginForm.tsx", confidence: 1, reason: "AST-based call" },
      ],
      symbolToFiles: new Map(),
      coOccurrence: new Map(),
    } as unknown as SymbolGraph;
  });

  it("should recursively trace impact up the call chain", () => {
    const blast = analyzer.traceBlastRadius("API_CORE", mockGraph, 5);
    
    expect(blast.impactedSymbols.length).toBe(3);
    const names = blast.impactedSymbols.map(n => n.symbol);
    expect(names).toContain("UserModule");
    expect(names).toContain("AuthService");
    expect(names).toContain("LoginForm");
    
    expect(blast.affectedFiles.length).toBe(3);
  });

  it("should respect max depth constraints", () => {
    const blast = analyzer.traceBlastRadius("API_CORE", mockGraph, 2);
    
    // Depth 0: API_CORE
    // Depth 1: UserModule
    // Depth 2: AuthService
    // LoginForm is depth 3, so it should be excluded
    expect(blast.impactedSymbols.length).toBe(2);
    const names = blast.impactedSymbols.map(n => n.symbol);
    expect(names).toContain("UserModule");
    expect(names).toContain("AuthService");
    expect(names).not.toContain("LoginForm");
  });

  it("should categorize severity correctly", () => {
    const lowBlast = analyzer.traceBlastRadius("AuthService", mockGraph, 2);
    expect(lowBlast.severity).toBe("low"); // 1 file, 1 symbol -> low

    const medBlast = analyzer.traceBlastRadius("UserModule", mockGraph, 5);
    // UserModule is called by AuthService. AuthService is called by LoginForm.
    // Affected files: AuthService.ts, LoginForm.tsx (2)
    // Impacted symbols: AuthService, LoginForm (2)
    // Files > 1 -> medium
    expect(medBlast.severity).toBe("medium");
  });

  it("should detect high severity for large blast radius", () => {
    // Add many callers to API_CORE to trigger high severity
    for (let i = 0; i < 10; i++) {
      const file = `/src/Mod${i}.ts`;
      const sym = `Sym${i}`;
      mockGraph.usage.get("API_CORE")!.calledBy.add(file);
      mockGraph.relationships.push({
        from: sym,
        to: "API_CORE",
        type: "calls",
        file,
        confidence: 1,
        reason: "AST-based call"
      });
    }

    const blast = analyzer.traceBlastRadius("API_CORE", mockGraph, 5);
    // 10 new files + 1 original (UserModule) = 11 files (> 5) -> high
    expect(blast.severity).toBe("high");
  });
});
