/**
 * Tests for Vibe-Centric Severity (Registry Lookup)
 *
 * Verifies that:
 * 1. Missing packages that EXIST on registry are flagged as 'missingDependency' (Low)
 * 2. Missing packages that DO NOT EXIST are flagged as 'dependencyHallucination' (Critical)
 */

import { validateManifest } from "../../src/tools/validation/validation.js";
import { checkPackageRegistry } from "../../src/tools/validation/registry.js";
import { ManifestDependencies } from "../../src/tools/validation/types.js";

// Mock the registry lookup
jest.mock("../../src/tools/validation/registry.js", () => ({
  checkPackageRegistry: jest.fn(),
}));

describe("Vibe-Centric Severity", () => {
  const mockManifest: ManifestDependencies = {
    dependencies: new Set(["react"]),
    devDependencies: new Set(["typescript"]),
    all: new Set(["react", "typescript"]),
  };

  const code = "import { x } from 'pkg';";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should flag hallucinated package as CRITICAL (dependencyHallucination)", async () => {
    // Setup: 'unknown-pkg' does NOT exist in registry
    (checkPackageRegistry as jest.Mock).mockResolvedValue(false);

    const imports = [
      {
        module: "unknown-pkg",
        names: [{ imported: "x", local: "x" }],
        isExternal: true,
        line: 1,
      },
    ];

    const issues = await validateManifest(imports, mockManifest, code, "typescript");

    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe("dependencyHallucination");
    expect(issues[0].severity).toBe("critical");
    expect(issues[0].message).toContain("does not exist on typescript registry");
  });

  it("should flag uninstalled real package as LOW (missingDependency)", async () => {
    // Setup: 'axios' EXISTS in registry
    (checkPackageRegistry as jest.Mock).mockResolvedValue(true);

    const imports = [
      {
        module: "axios", // Not in mockManifest
        names: [{ imported: "get", local: "get" }],
        isExternal: true,
        line: 1,
      },
    ];

    const issues = await validateManifest(imports, mockManifest, code, "typescript");

    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe("missingDependency");
    expect(issues[0].severity).toBe("low");
    expect(issues[0].message).toContain("is not installed (but exists on registry)");
  });

  it("should ignores packages already in manifest", async () => {
    const imports = [
      {
        module: "react", // In mockManifest
        names: [{ imported: "useState", local: "useState" }],
        isExternal: true,
        line: 1,
      },
    ];

    const issues = await validateManifest(imports, mockManifest, code, "typescript");

    expect(issues.length).toBe(0);
    expect(checkPackageRegistry).not.toHaveBeenCalled();
  });
});
