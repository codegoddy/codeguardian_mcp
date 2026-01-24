/**
 * Test for React False Positives
 *
 * These tests ensure we don't flag legitimate React patterns as hallucinations.
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";

describe("React False Positive Prevention", () => {
  const projectPath = ".";

  it("should NOT flag root.render() from React 18 createRoot", async () => {
    const newCode = `
import { createRoot } from 'react-dom/client';
import App from './App';

const root = createRoot(document.getElementById('root'));
root.render(<App />);
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false,
    });

    const parsed = JSON.parse(result.content[0].text);

    // Should not flag render as a hallucination
    const methodIssues = parsed.hallucinations.filter(
      (i: any) =>
        i.type === "nonExistentMethod" && i.message.includes("render"),
    );

    expect(methodIssues.length).toBe(0);
  });

  it("should NOT flag common array methods like slice", async () => {
    const newCode = `
const tasks = [1, 2, 3, 4, 5];
const firstThree = tasks.slice(0, 3);
const sorted = tasks.sort();
const filtered = tasks.filter(t => t > 2);
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false,
    });

    const parsed = JSON.parse(result.content[0].text);

    // Should not flag any of these common array methods
    const methodIssues = parsed.hallucinations.filter(
      (i: any) => i.type === "nonExistentMethod",
    );

    expect(methodIssues.length).toBe(0);
  });

  it("should NOT flag common string methods", async () => {
    const newCode = `
const text = "Hello World";
const lower = text.toLowerCase();
const upper = text.toUpperCase();
const trimmed = text.trim();
const parts = text.split(" ");
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false,
    });

    const parsed = JSON.parse(result.content[0].text);

    // Should not flag any of these common string methods
    const methodIssues = parsed.hallucinations.filter(
      (i: any) => i.type === "nonExistentMethod",
    );

    expect(methodIssues.length).toBe(0);
  });

  it("should NOT flag common DOM methods", async () => {
    const newCode = `
const element = document.getElementById('root');
element.addEventListener('click', handleClick);
element.classList.add('active');
element.setAttribute('data-id', '123');
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false,
    });

    const parsed = JSON.parse(result.content[0].text);

    // Should not flag any of these common DOM methods
    const methodIssues = parsed.hallucinations.filter(
      (i: any) => i.type === "nonExistentMethod",
    );

    expect(methodIssues.length).toBe(0);
  });

  it("should STILL catch actual hallucinations on real objects", async () => {
    const newCode = `
const tasks = [1, 2, 3];
// This is a real hallucination - arrays don't have a 'quantum' method
const result = tasks.quantum();
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false,
    });

    const parsed = JSON.parse(result.content[0].text);

    // SHOULD flag this as a hallucination
    const methodIssues = parsed.hallucinations.filter(
      (i: any) =>
        i.type === "nonExistentMethod" && i.message.includes("quantum"),
    );

    expect(methodIssues.length).toBeGreaterThan(0);
  });
});
