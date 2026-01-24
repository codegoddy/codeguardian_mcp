/**
 * Usage Pattern Consistency Tests
 * 
 * Verifies Secret #5 (The Helpfulness Pattern):
 * 1. Ritual Learning: Mine co-occurrence from symbol graph.
 * 2. Deviation Detection: Flag missing ritual calls.
 * 
 * @format
 */

import { UsagePatternAnalyzer } from "../../src/analyzers/usagePatterns.js";
import { SymbolGraph } from "../../src/types/symbolGraph.js";

describe("Secret #5: Usage Pattern Consistency (Helpfulness Pattern)", () => {
  let analyzer: UsagePatternAnalyzer;
  let mockGraph: SymbolGraph;

  beforeEach(() => {
    analyzer = new UsagePatternAnalyzer();
    
    // Setup mock graph with a clear "ritual"
    // Whenever 'startSession' is called, 'trackEvent' is also called (100% ritual)
    mockGraph = {
      usage: new Map([
        ["startSession", { usageCount: 10, importCount: 0, calledBy: new Set(), coOccurs: new Map() }],
        ["trackEvent", { usageCount: 10, importCount: 0, calledBy: new Set(), coOccurs: new Map() }],
      ]),
      relationships: [],
      symbolToFiles: new Map(),
      coOccurrence: new Map([
        ["startSession", new Map([["trackEvent", 10]])],
        ["trackEvent", new Map([["startSession", 10]])],
      ]),
    } as unknown as SymbolGraph;
  });

  it("should learn rituals from the symbol graph", async () => {
    await analyzer.analyze(mockGraph);
    
    // Check if startSession has a ritual for trackEvent
    const deviations = analyzer.checkDeviations("startSession", ["otherFunc"]);
    expect(deviations.length).toBe(1);
    expect(deviations[0]).toContain("usually also call 'trackEvent'");
  });

  it("should not flag deviations when the ritual is followed", async () => {
    await analyzer.analyze(mockGraph);
    
    const deviations = analyzer.checkDeviations("startSession", ["trackEvent", "init"]);
    expect(deviations.length).toBe(0);
  });

  it("should only establishment patterns for significant frequencies (>80%)", async () => {
    // Add a noisy co-occurrence (only 2 out of 10 times)
    const noisyMap = mockGraph.coOccurrence.get("startSession")!;
    noisyMap.set("randomLogger", 2);

    await analyzer.analyze(mockGraph);
    
    const deviations = analyzer.checkDeviations("startSession", ["other"]);
    // Should still only have 1 deviation (trackEvent), randomLogger should be ignored
    expect(deviations.length).toBe(1);
    expect(deviations[0]).not.toContain("randomLogger");
  });
});
