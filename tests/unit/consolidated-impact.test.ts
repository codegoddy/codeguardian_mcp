/**
 * Consolidated Impact Analysis Tests
 * 
 * Verifies the unified 'get_dependency_graph' tool:
 * 1. File-level impact (original)
 * 2. Symbol-level semantic impact (Secret #6)
 * 3. AI Context Bundling (Secret #7)
 * 
 * @format
 */

import { getDependencyGraphTool } from "../../src/tools/getDependencyGraph.js";
import { getProjectContext } from "../../src/context/projectContext.js";
import { impactAnalyzer } from "../../src/analyzers/impactAnalyzer.js";

// Mock the context and impact analyzer
jest.mock("../../src/context/projectContext.js");
jest.mock("../../src/analyzers/impactAnalyzer.js");

describe("Consolidated Impact Analysis (Secret #7)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return symbol impact when 'symbol' parameter is provided", async () => {
    const mockContext = {
      symbolGraph: { usage: new Map() },
      files: new Map(),
      importGraph: new Map(),
      reverseImportGraph: new Map(),
    };
    (getProjectContext as jest.Mock).mockResolvedValue(mockContext);
    
    (impactAnalyzer.traceBlastRadius as jest.Mock).mockReturnValue({
      target: "myFunc",
      severity: "low",
      impactedSymbols: [],
      affectedFiles: ["file1.ts"]
    });

    const result: any = await getDependencyGraphTool.handler({
      target: "src",
      language: "typescript",
      symbol: "myFunc"
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.symbolImpact).toBeDefined();
    expect(data.symbolImpact.target).toBe("myFunc");
    expect(impactAnalyzer.traceBlastRadius).toHaveBeenCalledWith(
      "myFunc",
      expect.anything(),
      expect.anything()
    );
  });

  it("should include AI Bundle when 'includeSource' is true", async () => {
    const mockContext = {
      symbolGraph: { usage: new Map() },
      files: new Map(),
      importGraph: new Map(),
      reverseImportGraph: new Map(),
    };
    (getProjectContext as jest.Mock).mockResolvedValue(mockContext);
    
    const mockImpact = {
      target: "myFunc",
      severity: "low",
      impactedSymbols: [],
      affectedFiles: ["src/utils.ts"]
    };
    (impactAnalyzer.traceBlastRadius as jest.Mock).mockReturnValue(mockImpact);
    (impactAnalyzer.bundleAffectedSource as jest.Mock).mockResolvedValue("# AI Bundle Content");

    const result: any = await getDependencyGraphTool.handler({
      target: "src",
      language: "typescript",
      symbol: "myFunc",
      includeSource: true
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.aiBundle).toBe("# AI Bundle Content");
    expect(impactAnalyzer.bundleAffectedSource).toHaveBeenCalled();
  });

  it("should return project hubs when 'showHubs' is true", async () => {
    const mockContext = {
      symbolGraph: { usage: new Map() },
      files: new Map(),
      importGraph: new Map(),
      reverseImportGraph: new Map(),
    };
    (getProjectContext as jest.Mock).mockResolvedValue(mockContext);
    
    const mockHubs = [{
      symbol: "GlobalState",
      file: "src/state.ts",
      centralityScore: 0.9,
      dependentsCount: 50,
      description: "The Grand Central Terminal: 'GlobalState' is the project's brain."
    }];
    (impactAnalyzer.getProjectHubs as jest.Mock).mockReturnValue(mockHubs);

    const result: any = await getDependencyGraphTool.handler({
      target: "src",
      language: "typescript",
      showHubs: true
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.projectHubs).toHaveLength(1);
    expect(data.projectHubs[0].symbol).toBe("GlobalState");
    expect(impactAnalyzer.getProjectHubs).toHaveBeenCalled();
  });
});
