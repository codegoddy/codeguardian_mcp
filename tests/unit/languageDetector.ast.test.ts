/**
 * @format
 */

import { describe, it, expect } from "vitest";
import { detectFromContent, detectLanguage } from "../../src/analyzers/languageDetector.js";

describe("LanguageDetector - AST-based content detection", () => {
  it("detects TypeScript when TS-specific AST nodes exist", () => {
    const code = `
interface User {
  id: string;
}

export function greet(u: User): string {
  return u.id;
}
`;

    const result = detectFromContent(code);
    expect(result).toBeTruthy();
    expect(result?.language).toBe("typescript");
    expect(result?.method).toBe("content");
    expect(result?.confidence).toBeGreaterThanOrEqual(60);
  });

  it("prefers JavaScript for plain JS when JS/TS parse scores are close and no TS-specific nodes exist", () => {
    const code = `
export function add(a, b) {
  return a + b;
}
`;

    const result = detectFromContent(code);
    expect(result).toBeTruthy();
    expect(result?.language).toBe("javascript");
  });

  it("detects Python from Python syntax", () => {
    const code = `
def hello(name: str) -> str:
    return f"hi {name}"
`;

    const result = detectFromContent(code);
    expect(result).toBeTruthy();
    expect(result?.language).toBe("python");
  });

  it("uses extension mapping when filePath is provided", () => {
    const code = "def x():\n  return 1\n";
    const result = detectLanguage(code, "foo.py");
    expect(result.language).toBe("python");
    expect(result.method).toBe("extension");
    expect(result.confidence).toBe(100);
  });
});

