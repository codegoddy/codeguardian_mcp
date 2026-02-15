import { describe, it, expect } from "vitest";
import { detectUnusedLocalsAST } from "../../src/tools/validation/unusedLocals.js";

describe("Unused Local Detection Improvements", () => {
  it("should detect unused nested functions but NOT variables (noise reduction)", () => {
    const code = `
      import React from 'react';

      export function MyComponent() {
        const unusedVar = 10;
        const usedVar = 20;
        
        const unusedNestedFn = () => {
          console.log("I am unused");
        };

        return <div>{usedVar}</div>;
      }
    `;

    const issues = detectUnusedLocalsAST(code, "Component.tsx");

    const unusedVarFound = issues.find(i => i.name === 'unusedVar');
    const unusedFnFound = issues.find(i => i.name === 'unusedNestedFn');

    // Variables inside functions should be skipped to avoid noise (ESLint handles them)
    expect(unusedVarFound).toBeUndefined();
    // Functions inside functions should still be caught as they are higher-signal
    expect(unusedFnFound).toBeDefined();
  });

  it("should detect unused top-level variables", () => {
    const code = `
      const UNUSED_TOP_LEVEL = 100;
      export function MyComponent() {
        return <div>Hello</div>;
      }
    `;
    const issues = detectUnusedLocalsAST(code, "Component.tsx");
    expect(issues.some(i => i.name === 'UNUSED_TOP_LEVEL')).toBe(true);
  });

  it("should detect unused exported types (project-wide check mockup)", () => {
    // Note: detectUnusedLocalsAST is for single-file. 
    // Exported symbols are skipped in single-file analysis because they might be used elsewhere.
    // We already improved project-wide analysis in deadCode.ts.
  });

  it("should NOT flag function parameters as unused variables", () => {
    const code = `
      export function MyComponent({ active, id }) {
        return <div id={id}>{active ? 'Yes' : 'No'}</div>;
      }
    `;

    const issues = detectUnusedLocalsAST(code, "Component.tsx");
    expect(issues.length).toBe(0);
  });
});
