import { describe, it, expect } from "vitest";
import {
    extractSymbolsAST,
    extractUsagesAST,
    extractImportsAST,
    collectLocalDefinitionsAST,
} from "../../src/tools/validation/extractors/index.js";
import { validateSymbols } from "../../src/tools/validation/validation.js";

describe("TypeScript Enum False Positives", () => {
    describe("Symbol Extraction", () => {
        it("should extract enum name AND member names as symbols", () => {
            const code = `
        export enum OrderPriority {
          Low = 'low',
          Normal = 'normal',
          High = 'high',
          Urgent = 'urgent'
        }
      `;

            const symbols = extractSymbolsAST(code, "test.ts", "typescript");

            // The enum name itself should be extracted
            const enumSymbol = symbols.find((s) => s.name === "OrderPriority");
            expect(enumSymbol).toBeDefined();
            expect(enumSymbol?.type).toBe("variable");
            expect(enumSymbol?.isExported).toBe(true);

            // Each member should also be extracted as a scoped variable
            const low = symbols.find((s) => s.name === "Low");
            const normal = symbols.find((s) => s.name === "Normal");
            const high = symbols.find((s) => s.name === "High");
            const urgent = symbols.find((s) => s.name === "Urgent");

            expect(low).toBeDefined();
            expect(normal).toBeDefined();
            expect(high).toBeDefined();
            expect(urgent).toBeDefined();

            // Members should have the enum name as scope
            expect(low?.scope).toBe("OrderPriority");
            expect(normal?.scope).toBe("OrderPriority");
        });

        it("should extract numeric enum members", () => {
            const code = `
        enum Status {
          Active = 0,
          Inactive = 1,
          Pending = 2
        }
      `;

            const symbols = extractSymbolsAST(code, "test.ts", "typescript");

            expect(symbols.find((s) => s.name === "Status")).toBeDefined();
            expect(symbols.find((s) => s.name === "Active")).toBeDefined();
            expect(symbols.find((s) => s.name === "Inactive")).toBeDefined();
            expect(symbols.find((s) => s.name === "Pending")).toBeDefined();
        });

        it("should extract bare enum members (no assignment)", () => {
            const code = `
        enum Direction {
          Up,
          Down,
          Left,
          Right
        }
      `;

            const symbols = extractSymbolsAST(code, "test.ts", "typescript");

            expect(symbols.find((s) => s.name === "Direction")).toBeDefined();
            expect(symbols.find((s) => s.name === "Up")).toBeDefined();
            expect(symbols.find((s) => s.name === "Down")).toBeDefined();
            expect(symbols.find((s) => s.name === "Left")).toBeDefined();
            expect(symbols.find((s) => s.name === "Right")).toBeDefined();
        });
    });

    describe("Usage Extraction", () => {
        it("should NOT extract enum member names as usages/references", () => {
            const code = `
        export enum OrderPriority {
          Low = 'low',
          Normal = 'normal',
          High = 'high',
          Urgent = 'urgent'
        }
      `;

            const imports = extractImportsAST(code, "typescript");
            const usages = extractUsagesAST(code, "typescript", imports);

            // Enum member names should NOT appear as usages
            const lowUsage = usages.find((u) => u.name === "Low");
            const normalUsage = usages.find((u) => u.name === "Normal");
            const highUsage = usages.find((u) => u.name === "High");
            const urgentUsage = usages.find((u) => u.name === "Urgent");

            expect(lowUsage).toBeUndefined();
            expect(normalUsage).toBeUndefined();
            expect(highUsage).toBeUndefined();
            expect(urgentUsage).toBeUndefined();
        });

        it("should NOT extract enum name as a usage within its own declaration", () => {
            const code = `
        enum Status {
          Active = 0,
          Inactive = 1
        }
      `;

            const imports = extractImportsAST(code, "typescript");
            const usages = extractUsagesAST(code, "typescript", imports);

            // The enum declaration name 'Status' should not be treated as a reference
            const statusUsage = usages.find((u) => u.name === "Status");
            expect(statusUsage).toBeUndefined();
        });
    });

    describe("Local Definitions", () => {
        it("should collect enum member names as local definitions", () => {
            const code = `
        enum OrderPriority {
          Low = 'low',
          Normal = 'normal',
          High = 'high',
          Urgent = 'urgent'
        }
      `;

            const definitions = collectLocalDefinitionsAST(code, "typescript");

            // The enum name should be in local definitions
            expect(definitions.has("OrderPriority")).toBe(true);

            // Enum members should also be in local definitions
            expect(definitions.has("Low")).toBe(true);
            expect(definitions.has("Normal")).toBe(true);
            expect(definitions.has("High")).toBe(true);
            expect(definitions.has("Urgent")).toBe(true);
        });
    });

    describe("Validation (End-to-End)", () => {
        it("should NOT flag enum members as undefinedVariable", () => {
            const code = `
        import { something } from './module';

        export enum OrderPriority {
          Low = 'low',
          Normal = 'normal',
          High = 'high',
          Urgent = 'urgent'
        }

        const priority = OrderPriority.High;
      `;

            const imports = extractImportsAST(code, "typescript");
            const symbols = extractSymbolsAST(code, "test.ts", "typescript");

            // Convert symbols to ProjectSymbol format for validateSymbols
            const projectSymbols = symbols.map((s) => ({
                name: s.name,
                type: s.type as "function" | "class" | "method" | "variable" | "import" | "decorator",
                file: s.file || "test.ts",
                line: s.line,
                scope: s.scope,
            }));

            const usages = extractUsagesAST(code, "typescript", imports);

            const issues = validateSymbols(
                usages,
                projectSymbols,
                code,
                "typescript",
                false, // strictMode
                imports,
                new Map(), // pythonExports
                null, // context
                "test.ts" // filePath
            );

            // Filter to only undefinedVariable issues
            const undefinedVarIssues = issues.filter(
                (i) => i.type === "undefinedVariable"
            );

            // Enum members should NOT be flagged
            const enumMemberIssues = undefinedVarIssues.filter((i) =>
                ["Low", "Normal", "High", "Urgent"].some((name) =>
                    i.message.includes(name)
                )
            );

            expect(enumMemberIssues).toHaveLength(0);
        });
    });
});
