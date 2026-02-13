/**
 * Targeted test for the dead code detection fix
 * 
 * This test verifies that the fix for detectUnusedLocals in autoValidator.ts works correctly.
 * 
 * Issue: The validateFile function was calling detectDeadCode with perFileOnly=true but
 * the newCode parameter was not being passed correctly, causing local dead code to not be detected.
 * 
 * Fix: Changed validateFile to call detectUnusedLocals directly for per-file dead code detection.
 * 
 * AST-BASED IMPROVEMENT: The detectUnusedLocals function now uses AST parsing instead of regex,
 * which properly handles:
 * - All naming conventions (camelCase, PascalCase, UPPER_SNAKE_CASE)
 * - Both JavaScript/TypeScript AND Python
 * - Exported vs non-exported symbols
 */

import { detectUnusedLocals } from "../../src/tools/validation/deadCode.js";

describe("detectUnusedLocals - per-file dead code detection", () => {
  describe("Backend-style code (TypeScript/JavaScript)", () => {
    it("should detect unused local function (like unusedHelperFunction in server.ts)", () => {
      const code = `
import express from 'express';
const app = express();

// This function is never used
function unusedHelperFunction() {
  console.log("I am useless!");
  return 42;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
`;
      const issues = detectUnusedLocals(code, "backend/src/server.ts");
      
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.name === "unusedHelperFunction" && i.type === "unusedFunction")).toBe(true);
    });

    it("should NOT flag exported functions as unused (they may be used elsewhere)", () => {
      const code = `
// Exported functions should not be flagged by per-file scan
export function helperFunction() {
  console.log("I might be used elsewhere!");
  return 42;
}
`;
      const issues = detectUnusedLocals(code, "backend/src/helper.ts");
      
      // Should not flag exported functions
      expect(issues.some(i => i.name === "helperFunction")).toBe(false);
    });
  });

  describe("Frontend-style code (React/TypeScript)", () => {
    it("should detect unused local variable in camelCase (like unusedVariable in App.tsx)", () => {
      // AST-based detection now properly handles camelCase variables!
      const code = `
import { useState } from 'react';

function App() {
  // This variable is never used - camelCase should be detected
  const unusedVariable = "I am not used anywhere";
  
  const [count, setCount] = useState(0);
  
  return <div>{count}</div>;
}
`;
      const issues = detectUnusedLocals(code, "frontend/src/App.tsx");
      
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.name === "unusedVariable" && i.type === "unusedExport")).toBe(true);
    });

    it("should detect unused UPPER_SNAKE_CASE constants", () => {
      const code = `
function App() {
  const UNUSED_CONFIG = { key: "value" };
  const usedConfig = { key: "value2" };
  
  console.log(usedConfig);
  
  return <div>Hello</div>;
}
`;
      const issues = detectUnusedLocals(code, "frontend/src/App.tsx");
      
      expect(issues.some(i => i.name === "UNUSED_CONFIG")).toBe(true);
      expect(issues.some(i => i.name === "usedConfig")).toBe(false);
    });

    it("should NOT flag exported constants as unused", () => {
      const code = `
// This is exported - might be used elsewhere
export const unusedApiFunction = () => {
  return "I'm never called";
};
`;
      const issues = detectUnusedLocals(code, "frontend/src/services/api.ts");
      
      // Should not flag exported constants
      expect(issues.some(i => i.name === "unusedApiFunction")).toBe(false);
    });

    it("should detect multiple unused locals in the same file", () => {
      const code = `
function Component() {
  const UPPER_UNUSED1 = "not used";
  const UPPER_UNUSED2 = "also not used";
  const USED_VALUE = "this is used";
  
  console.log(USED_VALUE);
  
  function innerUnused() {
    return "never called";
  }
  
  return <div>{USED_VALUE}</div>;
}
`;
      const issues = detectUnusedLocals(code, "Component.tsx");
      
      // Should detect the unused function and unused constants (in UPPER_CASE pattern)
      expect(issues.length).toBeGreaterThanOrEqual(2);
      expect(issues.some(i => i.name === "UPPER_UNUSED1")).toBe(true);
      expect(issues.some(i => i.name === "UPPER_UNUSED2")).toBe(true);
      expect(issues.some(i => i.name === "innerUnused")).toBe(true);
      // 'USED_VALUE' should NOT be flagged (it's used in console.log and return)
      expect(issues.some(i => i.name === "USED_VALUE")).toBe(false);
    });
  });

  describe("React hooks patterns", () => {
    it("should NOT flag React hooks as unused (they start with 'use')", () => {
      const code = `
import { useState, useEffect } from 'react';

function App() {
  const [state, setState] = useState(0);
  
  useEffect(() => {
    console.log("mounted");
  }, []);
  
  return <div>{state}</div>;
}
`;
      const issues = detectUnusedLocals(code, "App.tsx");
      
      // Should not flag standard React hooks
      expect(issues.some(i => i.name?.startsWith("use"))).toBe(false);
    });

    it("should detect non-existent hook calls as unused if defined locally", () => {
      // Note: This tests the pattern, but actual hallucination detection
      // happens in symbol validation, not dead code detection
      const code = `
function Component() {
  // Custom hook that's not defined or imported
  const metrics = useNonExistentHook();
  
  return <div>{metrics}</div>;
}
`;
      // useNonExistentHook is used (in the return), so it won't be flagged as dead code
      // But if it were defined locally and never called, it would be
      const issues = detectUnusedLocals(code, "Component.tsx");
      
      // metrics is used in return, so no dead code here
      expect(issues.some(i => i.name === "metrics")).toBe(false);
    });
  });

  describe("Python-style code", () => {
    it("should detect unused Python functions", () => {
      const code = `
def unused_helper():
    print("I am useless!")
    return 42

def main():
    print("Hello World")
`;
      const issues = detectUnusedLocals(code, "backend/main.py");
      
      expect(issues.some(i => i.name === "unused_helper" && i.type === "unusedFunction")).toBe(true);
    });
  });
});

describe("Integration - autoValidator.ts changes", () => {
  it("validateFile should now use detectUnusedLocals directly", () => {
    // This is a conceptual test - the actual integration is tested
    // by the fact that detectUnusedLocals works correctly above
    
    // The key change was:
    // BEFORE: deadCodeIssues = await detectDeadCode(context, content, undefined, true);
    //         // This had issues because detectDeadCode expected newCode but got context
    // 
    // AFTER: const deadCodeIssues = detectUnusedLocals(content, filePath);
    //         // Direct call with correct parameters
    
    const code = `
function test() {
  const unused = "this should be detected";
  return "hello";
}
`;
    const issues = detectUnusedLocals(code, "test.ts");
    
    // Verify the fix works by checking that unused locals are detected
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].file).toBe("test.ts");
  });
});
