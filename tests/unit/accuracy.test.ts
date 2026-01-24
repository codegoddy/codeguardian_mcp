/**
 * Accuracy Tests for Hallucination Detection
 *
 * This test suite focuses on reducing false positives by verifying:
 * 1. Parameters in arrow functions and methods
 * 2. Browser/Web API globals
 * 3. Test framework globals
 * 4. Named export support
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";
import { clearContextCache } from "../../src/context/projectContext.js";

describe("Validation Accuracy", () => {
  beforeEach(() => {
    clearContextCache();
  });

  it("should NOT flag parameters in arrow functions", async () => {
    const result = await validateCodeTool.handler({
      projectPath: ".",
      newCode: `
        const set = (state) => {
          console.log(state.id);
          state.update();
        };
        
        // Zustand style
        set((state) => state.data);
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hallucinations.filter((h: any) => h.name === "state").length).toBe(0);
    expect(parsed.score).toBe(100);
  });

  it("should NOT flag browser/Web API globals", async () => {
    const result = await validateCodeTool.handler({
      projectPath: ".",
      newCode: `
        alert("Hello");
        confirm("Are you sure?");
        const data = localStorage.getItem("key");
        requestAnimationFrame(() => {});
        const performance = window.performance;
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hallucinations.length).toBe(0);
    expect(parsed.score).toBe(100);
  });

  it("should NOT flag common test globals", async () => {
    const result = await validateCodeTool.handler({
      projectPath: ".",
      newCode: `
        describe("my test", () => {
          it("works", () => {
            expect(true).toBe(true);
          });
        });
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hallucinations.length).toBe(0);
    expect(parsed.score).toBe(100);
  });

  it("should NOT flag destructured parameters", async () => {
    const result = await validateCodeTool.handler({
      projectPath: ".",
      newCode: `
        const MyComponent = ({ onRefresh, data }) => {
          onRefresh();
          console.log(data.id);
        };
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hallucinations.length).toBe(0);
    expect(parsed.score).toBe(100);
  });

  it("should NOT flag built-ins in Promise callbacks", async () => {
    const result = await validateCodeTool.handler({
      projectPath: ".",
      newCode: `
        new Promise((resolve, reject) => {
          resolve(true);
        });
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hallucinations.length).toBe(0);
    expect(parsed.score).toBe(100);
  });

  it("should NOT flag singular parameter arrow functions (no parens)", async () => {
    const result = await validateCodeTool.handler({
      projectPath: ".",
      newCode: `
        new Promise(resolve => resolve(true));
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hallucinations.length).toBe(0);
    expect(parsed.score).toBe(100);
  });

  it("should NOT flag JSX text content as functions", async () => {
    const result = await validateCodeTool.handler({
      projectPath: ".",
      newCode: `
        export const MyComp = () => (
          <div>
            <span>Notes (Optional)</span>
            <label>Confirm (Yes/No)</label>
          </div>
        );
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    // Focus on ensuring "Notes" or "Confirm" aren't flagged as functions
    const hallucinations = parsed.hallucinations.filter((h: any) => 
      h.message.includes("'Notes'") || h.message.includes("'Confirm'")
    );
    expect(hallucinations.length).toBe(0);
  });

  it("should NOT flag named exports in validate_code", async () => {
    const result = await validateCodeTool.handler({
      projectPath: ".",
      newCode: `
        export { validateCodeTool };
        export { validateCodeTool as validator };
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hallucinations.length).toBe(0);
    expect(parsed.score).toBe(100);
  });
});
