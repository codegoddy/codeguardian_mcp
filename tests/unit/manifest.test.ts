/**
 * Unit Tests for Manifest Loader Module
 *
 * Tests the manifest loading functionality for:
 * - package.json parsing
 * - requirements.txt parsing
 * - pyproject.toml parsing
 * - Python __all__ export tracking
 *
 * @format
 */

import {
  loadManifestDependencies,
  loadPackageJson,
  loadPythonDependencies,
  loadPythonModuleExports,
  isPythonSymbolExported,
} from "../../src/tools/validation/manifest.js";
import { ManifestDependencies } from "../../src/tools/validation/types.js";

describe("Manifest Loader Module", () => {
  describe("loadManifestDependencies", () => {
    it("should load package.json for JavaScript/TypeScript projects", async () => {
      const manifest = await loadManifestDependencies(".", "typescript");

      // Should have loaded dependencies from the actual package.json
      expect(manifest.all.size).toBeGreaterThan(0);
      // CodeGuardian uses web-tree-sitter (WASM) for parsing
      expect(manifest.all.has("web-tree-sitter")).toBe(true);
    });

    it("should return empty manifest for non-existent project", async () => {
      const manifest = await loadManifestDependencies(
        "/non/existent/path",
        "typescript",
      );

      expect(manifest.all.size).toBe(0);
      expect(manifest.dependencies.size).toBe(0);
      expect(manifest.devDependencies.size).toBe(0);
    });
  });

  describe("loadPackageJson", () => {
    it("should parse package.json correctly", async () => {
      const result: ManifestDependencies = {
        dependencies: new Set(),
        devDependencies: new Set(),
        all: new Set(),
      };

      await loadPackageJson(".", result);

      // Should have loaded some dependencies
      expect(result.all.size).toBeGreaterThan(0);

      // Should include scoped packages
      const hasScopedPackage = Array.from(result.all).some((dep) =>
        dep.startsWith("@"),
      );
      expect(hasScopedPackage).toBe(true);
    });

    it("should handle scoped packages correctly", async () => {
      const result: ManifestDependencies = {
        dependencies: new Set(),
        devDependencies: new Set(),
        all: new Set(),
      };

      await loadPackageJson(".", result);

      // If we have @anthropic-ai/sdk, we should also have @anthropic-ai
      const hasAnthropicSdk = result.all.has("@anthropic-ai/sdk");
      if (hasAnthropicSdk) {
        expect(result.all.has("@anthropic-ai")).toBe(true);
      }
    });
  });

  describe("loadPythonDependencies", () => {
    it("should include Python standard library modules", async () => {
      const result: ManifestDependencies = {
        dependencies: new Set(),
        devDependencies: new Set(),
        all: new Set(),
      };

      await loadPythonDependencies(".", result);

      // Should include standard library modules
      expect(result.all.has("os")).toBe(true);
      expect(result.all.has("sys")).toBe(true);
      expect(result.all.has("json")).toBe(true);
      expect(result.all.has("re")).toBe(true);
    });
  });

  describe("isPythonSymbolExported", () => {
    it("should return true when no __all__ is defined", () => {
      const moduleExports = new Map<string, Set<string>>();

      const result = isPythonSymbolExported(
        "mymodule",
        "myfunction",
        moduleExports,
      );

      expect(result).toBe(true);
    });

    it("should return true when symbol is in __all__", () => {
      const moduleExports = new Map<string, Set<string>>();
      moduleExports.set("mymodule", new Set(["myfunction", "myclass"]));

      const result = isPythonSymbolExported(
        "mymodule",
        "myfunction",
        moduleExports,
      );

      expect(result).toBe(true);
    });

    it("should return false when symbol is not in __all__", () => {
      const moduleExports = new Map<string, Set<string>>();
      moduleExports.set("mymodule", new Set(["myfunction", "myclass"]));

      const result = isPythonSymbolExported(
        "mymodule",
        "privatefunction",
        moduleExports,
      );

      expect(result).toBe(false);
    });
  });

  describe("loadPythonModuleExports", () => {
    it("should return empty map for non-Python project", async () => {
      const exports = await loadPythonModuleExports("tests/fixtures/dep-graph-project");

      // Fixture is TypeScript-only and should have no Python __init__.py files
      expect(exports.size).toBe(0);
    });
  });
});
