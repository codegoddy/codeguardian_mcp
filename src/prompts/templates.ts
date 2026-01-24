/**
 * Validation Prompt Templates
 *
 * Based on prompt engineering best practices:
 * - Zero-shot: Direct validation
 * - Few-shot: Learning from examples
 * - Chain-of-Thought: Step-by-step reasoning
 * - Self-consistency: Multiple perspectives
 *
 * @format
 */

import { PROMPT_PATTERNS, VALIDATION_CONSTRAINTS } from "./library.js";

export const VALIDATION_TEMPLATES = {
  /**
   * Zero-shot: Direct validation without examples
   * Best for: Simple, straightforward validation tasks
   */
  zeroShot: (code: string) =>
    `Use validate_code to check this code for hallucinations (non-existent functions, wrong methods, etc.):\n\n${code}`,

  /**
   * Few-shot: Validation with examples of common mistakes
   * Best for: Teaching the model what to look for
   */
  fewShot: (code: string) => {
    const task = "Check this code for hallucinations, missing dependencies, and wrong methods.";
    const examples = [
      {
        input: "const user = getUserById(id);",
        output: "❌ BAD: function doesn't exist",
        explanation: "The project uses findUserById instead."
      },
      {
        input: "import { Button } from 'react-ui';",
        output: "❌ BAD: package not installed",
        explanation: "Package 'react-ui' is missing from package.json."
      }
    ];
    
    return PROMPT_PATTERNS.withExamples(task, examples) + `\n\nCode to validate:\n\`\`\`\n${code}\n\`\`\``;
  },

  /**
   * Chain-of-Thought: Step-by-step reasoning
   * Best for: Complex validation requiring detailed analysis
   */
  chainOfThought: (code: string) => {
    const task = `Analyze this code systematically using validate_code:\n\n\`\`\`\n${code}\n\`\`\``;
    const steps = [
      "Extract all function calls and class instantiations",
      "Check each symbol against the project's symbol table",
      "Verify all imports exist in package.json/requirements.txt",
      "Check for dead code (unused exports)",
      "Provide specific fixes with reasoning"
    ];
    
    return PROMPT_PATTERNS.stepByStep(task, steps);
  },

  /**
   * Self-consistency: Multiple validation perspectives
   * Best for: High-stakes code requiring thorough review
   */
  selfConsistency: (code: string) => {
    const task = `Validate this code from multiple perspectives using validate_code:\n\n\`\`\`\n${code}\n\`\`\``;
    const perspectives = [
      "Symbol Validation: Are all functions, classes, and methods defined?",
      "Dependency Validation: Are all packages in the manifest?",
      "Logic Validation: Does the code make logical sense?"
    ];
    
    return PROMPT_PATTERNS.multiPerspective(task, perspectives);
  },

  /**
   * Structured output: Validation with explicit format requirements
   * Best for: Integration with automated systems
   */
  structuredOutput: (code: string) => {
    const task = `Use validate_code to analyze this code:\n\n\`\`\`\n${code}\n\`\`\``;
    const format = `
VALIDATION SUMMARY:
- Status: [PASS/FAIL]
- Score: [0-100]
- Hallucinations Found: [count]

CRITICAL ISSUES (if any):
1. [Issue description]
   - Severity: [critical/high/medium/low]
   - Suggestion: [specific fix]
   - Confidence: [0-100%]
    `;
    
    return PROMPT_PATTERNS.structuredOutput(task, format);
  },

  /**
   * Role-based: Validation from expert perspective
   * Best for: Domain-specific validation
   */
  roleBased: (code: string, role: string = "senior code reviewer") => {
    const task = `Thoroughly review this code for hallucinations and missing dependencies:\n\n\`\`\`\n${code}\n\`\`\``;
    const rolePrompt = PROMPT_PATTERNS.role(role, task);
    return PROMPT_PATTERNS.withConstraints(rolePrompt, VALIDATION_CONSTRAINTS);
  },
};
