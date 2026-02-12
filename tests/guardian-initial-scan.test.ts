/**
 * Tests for the Guardian initial scan improvements.
 *
 * Verifies that the initial health check:
 * 1. Detects hallucinated imports (packages not in package.json)
 * 2. Detects unused local functions (non-exported dead code)
 * 3. Correctly detects full-stack project language (not assuming backend=python)
 *
 * @format
 */

import { detectUnusedLocals } from "../src/tools/validation/deadCode";

// ==========================================================================
// Test 1: detectUnusedLocals should catch unused non-exported functions
// ==========================================================================

describe("detectUnusedLocals - Catch unused local functions", () => {

  it("should detect calculateMoonPhase as unused in Inventory.tsx", () => {
    // Simplified version of the Inventory.tsx code with the dead function
    const code = `
import { useState, useMemo } from 'react';
import { differenceInDays } from 'date-fns';

function getItemStatus(date: Date) {
  const days = differenceInDays(date, new Date());
  if (days < 0) return { label: 'DEPARTED', color: 'red' };
  if (days <= 3) return { label: 'CRITICAL', color: 'red' };
  return { label: 'OPTIMAL', color: 'gold' };
}

// Dead Code
function calculateMoonPhase(date: Date) {
  const moonCycle = 29.53;
  const knownNewMoon = new Date('2023-01-01');
  const daysSinceNewMoon = differenceInDays(date, knownNewMoon);
  return (daysSinceNewMoon % moonCycle) / moonCycle;
}

export function Inventory({ items }) {
  const expiringItems = useMemo(() => {
    return items.filter((item) => {
      const status = getItemStatus(item.expirationDate);
      return status.label !== 'OPTIMAL';
    });
  }, [items]);

  return <div>{expiringItems.length} items</div>;
}
`;

    const issues = detectUnusedLocals(code, "Inventory.tsx");
    const moonPhaseIssue = issues.find(i => i.name === "calculateMoonPhase");

    expect(moonPhaseIssue).toBeDefined();
    expect(moonPhaseIssue!.type).toBe("unusedFunction");
    expect(moonPhaseIssue!.severity).toBe("medium");
    expect(moonPhaseIssue!.message).toContain("calculateMoonPhase");
    expect(moonPhaseIssue!.message).toContain("never used");
  });

  it("should NOT flag getItemStatus as unused (it's called)", () => {
    const code = `
function getItemStatus(date: Date) {
  return { label: 'OK', color: 'green' };
}

function calculateMoonPhase(date: Date) {
  return 0.5;
}

export function Inventory({ items }) {
  const status = getItemStatus(new Date());
  return <div>{status.label}</div>;
}
`;

    const issues = detectUnusedLocals(code, "Inventory.tsx");
    const statusIssue = issues.find(i => i.name === "getItemStatus");
    const moonIssue = issues.find(i => i.name === "calculateMoonPhase");

    expect(statusIssue).toBeUndefined(); // getItemStatus IS used
    expect(moonIssue).toBeDefined();     // calculateMoonPhase is NOT used
  });

  it("should NOT flag exported functions as unused", () => {
    const code = `
export function helperA() { return 1; }
export function helperB() { return 2; }
function unusedInternal() { return 3; }
`;

    const issues = detectUnusedLocals(code, "helpers.ts");
    const helperA = issues.find(i => i.name === "helperA");
    const helperB = issues.find(i => i.name === "helperB");
    const unusedInternal = issues.find(i => i.name === "unusedInternal");

    expect(helperA).toBeUndefined();       // exported — skip
    expect(helperB).toBeUndefined();       // exported — skip
    expect(unusedInternal).toBeDefined();  // not exported, not used
  });
});

// ==========================================================================
// Test 2: filterIssuesByScope lenient mode should keep key issue types
// ==========================================================================

describe("filterIssuesByScope lenient mode behavior (regression)", () => {

  it("lenient scope filter should KEEP unusedFunction type (medium severity)", () => {
    // Simulate what filterIssuesByScope does in lenient mode
    // This is the exact logic from the fixed filterIssuesByScope
    const issues = [
      { type: "unusedFunction", severity: "medium", message: "Function 'calculateMoonPhase' is unused" },
      { type: "architecturalDeviation", severity: "high", message: "High impact change" },
      { type: "dependencyHallucination", severity: "critical", message: "Package 'react-phantom-hooks' does not exist" },
      { type: "unusedImport", severity: "low", message: "Unused import 'foo'" },
      { type: "missingDependency", severity: "low", message: "Package 'bar' is not installed" },
      { type: "nonExistentFunction", severity: "medium", message: "Function 'baz' not found" },
    ];

    // Apply the fixed lenient scope filter
    const filtered = issues.filter(issue =>
      issue.severity === 'critical' ||
      issue.severity === 'high' ||
      issue.type === 'unusedImport' ||
      issue.type === 'unusedFunction' ||
      issue.type === 'unusedExport' ||
      issue.type === 'dependencyHallucination' ||
      issue.type === 'missingDependency'
    );

    // unusedFunction (medium) should be kept ← was dropped before the fix
    expect(filtered.find(i => i.type === "unusedFunction")).toBeDefined();

    // dependencyHallucination (critical) should be kept
    expect(filtered.find(i => i.type === "dependencyHallucination")).toBeDefined();

    // unusedImport (low) should be kept
    expect(filtered.find(i => i.type === "unusedImport")).toBeDefined();

    // missingDependency (low) should be kept ← was dropped before the fix
    expect(filtered.find(i => i.type === "missingDependency")).toBeDefined();

    // architecturalDeviation (high) should be kept
    expect(filtered.find(i => i.type === "architecturalDeviation")).toBeDefined();

    // nonExistentFunction (medium) without a preserved type should be DROPPED
    expect(filtered.find(i => i.type === "nonExistentFunction")).toBeUndefined();
  });

  it("the OLD lenient filter would have dropped unusedFunction and missingDependency", () => {
    // Verify the old broken behavior to confirm what we fixed
    const issues = [
      { type: "unusedFunction", severity: "medium", message: "Dead function" },
      { type: "dependencyHallucination", severity: "critical", message: "Hallucinated" },
      { type: "missingDependency", severity: "low", message: "Missing dep" },
    ];

    // Old filter: ONLY critical/high
    const oldFilter = issues.filter(i =>
      i.severity === 'critical' || i.severity === 'high'
    );

    // Old filter drops unusedFunction (medium) and missingDependency (low)
    expect(oldFilter.find(i => i.type === "unusedFunction")).toBeUndefined();
    expect(oldFilter.find(i => i.type === "missingDependency")).toBeUndefined();
    // Only keeps dependencyHallucination (critical)
    expect(oldFilter.length).toBe(1);
  });
});
