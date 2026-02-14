/**
 * AutoValidator - Lenient mode filtering tests
 *
 * @format
 */

import { AutoValidator } from "../../src/agent/autoValidator.js";

describe("AutoValidator.applyLenientModeFiltering", () => {
  it("should keep missingDependency and dependencyHallucination issues in lenient mode", () => {
    const issues = [
      { type: "missingDependency", severity: "low", message: "missing" },
      { type: "dependencyHallucination", severity: "low", message: "hallucinated" },
      { type: "someOtherLow", severity: "low", message: "filtered" },
    ];

    const filtered = AutoValidator.applyLenientModeFiltering(issues);

    expect(filtered.map((i) => i.type).sort()).toEqual(
      ["dependencyHallucination", "missingDependency"].sort(),
    );
  });
});
