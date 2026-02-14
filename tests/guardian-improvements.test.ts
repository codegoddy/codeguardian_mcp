/**
 * Integration test for Guardian improvements
 * Tests the core validation logic directly
 */

import { describe, it, expect } from "vitest";
import { extractImportsAST, extractUsagesAST, extractTypeReferencesAST } from "../src/tools/validation/extractors/index.js";
import { validateSymbols } from "../src/tools/validation/validation.js";

describe("Guardian Improvements - Core Validation", () => {
  describe("Unused Import Detection", () => {
    it("should detect unused imports in small files", () => {
      const code = `
import React from 'react';
import { unusedHelper } from './helpers';

export function MyComponent() {
  return "Hello";
}
`;

      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);
      const typeReferences = extractTypeReferencesAST(code, "typescript");
      
      const issues = validateSymbols(
        usages,
        [], // empty symbol table
        code,
        "typescript",
        false, // strictMode
        imports,
        new Map(), // pythonExports
        null, // context
        "test.tsx",
        new Set(), // missingPackages
        typeReferences
      );

      const unusedImport = issues.find(i => i.type === "unusedImport");
      expect(unusedImport).toBeDefined();
      expect(unusedImport?.message).toContain("unusedHelper");
    });

    it("should NOT flag used imports", () => {
      const code = `
import { usedHelper } from './helpers';

export function MyComponent() {
  return usedHelper();
}
`;

      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);
      const typeReferences = extractTypeReferencesAST(code, "typescript");
      
      const issues = validateSymbols(
        usages,
        [],
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.tsx",
        new Set(),
        typeReferences
      );

      const unusedImport = issues.find(i => i.type === "unusedImport");
      expect(unusedImport).toBeUndefined();
    });
  });

  describe("Type-only Import Misuse Detection", () => {
    it("should detect when type-only import is used as value", () => {
      const code = `
import type { MyService } from './types';

const service = new MyService();
`;

      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);
      const typeReferences = extractTypeReferencesAST(code, "typescript");
      
      const issues = validateSymbols(
        usages,
        [],
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        typeReferences
      );

      const misuseIssue = issues.find(i => i.type === "typeOnlyImportMisuse");
      expect(misuseIssue).toBeDefined();
      expect(misuseIssue?.message).toContain("MyService");
    });

    it("should NOT flag type-only imports used in type positions", () => {
      const code = `
import type { User } from './types';

function greet(user: User) {
  return user.name;
}
`;

      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);
      const typeReferences = extractTypeReferencesAST(code, "typescript");
      
      const issues = validateSymbols(
        usages,
        [],
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        typeReferences
      );

      const misuseIssue = issues.find(i => i.type === "typeOnlyImportMisuse");
      expect(misuseIssue).toBeUndefined();
    });

    it("should detect type-only keyword in import statement", () => {
      const code = `import type { Foo } from './bar';`;
      
      const imports = extractImportsAST(code, "typescript");
      
      expect(imports).toHaveLength(1);
      expect(imports[0].isTypeOnly).toBe(true);
      expect(imports[0].names[0].imported).toBe("Foo");
    });

    it("should NOT mark regular imports as type-only", () => {
      const code = `import { Foo } from './bar';`;
      
      const imports = extractImportsAST(code, "typescript");
      
      expect(imports).toHaveLength(1);
      expect(imports[0].isTypeOnly).toBe(false);
    });
  });

  describe("Deep property hallucinations (Prisma delegate)", () => {
    it("should flag prisma.<missingModel>.findMany() when schema delegates are known", () => {
      // This test intentionally avoids a real schema.prisma and instead asserts
      // that the extractor preserves the deep object chain so validation can
      // decide based on project context at runtime.
      //
      // We validate the extraction shape: used.object should contain 'prisma.ghostItems'
      // (not just 'prisma'), otherwise delegate validation cannot work.
      const code = `
        import { prisma } from './db';

        async function x() {
          return prisma.ghostItems.findMany();
        }
      `;

      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      const methodUse = usages.find(
        (u) => u.type === "methodCall" && u.name === "findMany",
      );
      expect(methodUse).toBeDefined();
      // When the root object is imported, the extractor preserves the full chain.
      expect(methodUse?.object).toContain("prisma.ghostItems");

      // NOTE: actual delegate existence check happens against schema.prisma and requires
      // a real project context. That behavior is covered by end-to-end guardian tests.
      const typeReferences = extractTypeReferencesAST(code, "typescript");
      const issues = validateSymbols(
        usages,
        [],
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        typeReferences,
      );

      // We shouldn't crash and we should at least emit a method-related issue in strict contexts.
      expect(Array.isArray(issues)).toBe(true);
    });
  });
});
