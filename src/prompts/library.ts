/**
 * Reusable Prompt Patterns Library
 *
 * Collection of prompt engineering patterns for code validation
 * Based on best practices from the Prompt Engineering Guide
 *
 * @format
 */

export const PROMPT_PATTERNS = {
  /**
   * Role-based prompting: Assign a specific role to guide behavior
   */
  role: (role: string, task: string): string => `You are a ${role}. ${task}`,

  /**
   * Constraint-based prompting: Define clear boundaries
   */
  withConstraints: (task: string, constraints: string[]): string =>
    `${task}\n\nCONSTRAINTS:\n${constraints.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,

  /**
   * Output formatting: Specify exact output structure
   */
  structuredOutput: (task: string, format: string): string =>
    `${task}\n\nOUTPUT FORMAT:\n${format}`,

  /**
   * Error prevention: Highlight common mistakes to avoid
   */
  errorPrevention: (task: string, commonErrors: string[]): string =>
    `${task}\n\nAVOID THESE COMMON MISTAKES:\n${commonErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`,

  /**
   * Step-by-step reasoning: Break down complex tasks
   */
  stepByStep: (task: string, steps: string[]): string =>
    `${task}\n\nFOLLOW THESE STEPS:\n${steps.map((s, i) => `Step ${i + 1}: ${s}`).join("\n")}`,

  /**
   * Few-shot learning: Provide examples
   */
  withExamples: (
    task: string,
    examples: Array<{ input: string; output: string; explanation?: string }>,
  ): string => {
    const exampleText = examples
      .map((ex, i) => {
        let text = `EXAMPLE ${i + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}`;
        if (ex.explanation) {
          text += `\nWhy: ${ex.explanation}`;
        }
        return text;
      })
      .join("\n\n");

    return `${task}\n\n${exampleText}\n\nNow apply this to your task.`;
  },

  /**
   * Self-consistency: Multiple reasoning paths
   */
  multiPerspective: (task: string, perspectives: string[]): string =>
    `${task}\n\nAnalyze from these perspectives:\n${perspectives.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nThen synthesize your findings.`,

  /**
   * Confidence scoring: Request uncertainty quantification
   */
  withConfidence: (task: string): string =>
    `${task}\n\nFor each finding, include:\n- Confidence level (0-100%)\n- Reasoning for your confidence\n- Alternative interpretations if confidence < 90%`,
};

/**
 * Validation constraints for code review
 */
export const VALIDATION_CONSTRAINTS = [
  "Only flag symbols that truly don't exist in the project",
  "Provide fuzzy-matched suggestions for typos",
  "Check both direct imports and available symbols",
  "Consider built-in functions and standard library",
  "Distinguish between critical and minor issues",
  "Provide actionable fixes, not just problem descriptions",
];
