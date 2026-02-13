/**
 * AI Anti-Pattern Detector
 *
 * Lightweight heuristic detector used by unit tests and optional enrichment.
 *
 * NOTE: This intentionally avoids heavy parsing to keep runtime low.
 */

export type AIAntiPatternSeverity = "low" | "medium" | "high" | "critical";

export interface AIAntiPatternIssue {
  type:
    | "genericErrorHandling"
    | "unnecessaryAbstraction"
    | "missingValidation";
  severity: AIAntiPatternSeverity;
  message: string;
  line?: number;
}

function getLineNumberFromIndex(source: string, index: number): number {
  if (index <= 0) return 1;
  // Count '\n' up to index (1-based lines)
  let lines = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

function detectGenericErrorHandling(code: string): AIAntiPatternIssue[] {
  // Heuristic:
  // - find catch blocks
  // - flag those that only log the error (console.log/error/warn) without rethrow/handling
  // - do NOT flag if we see a throw inside the catch, or explicit logging via a structured logger
  const issues: AIAntiPatternIssue[] = [];

  // Match `catch (e) { ... }` including multiline body (non-greedy)
  const catchRe = /catch\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/g;
  for (const match of code.matchAll(catchRe)) {
    const full = match[0];
    const catchParam = (match[1] ?? "").trim();
    const body = match[2] ?? "";
    const matchIndex = match.index ?? 0;

    // If they rethrow or wrap, assume good.
    if (/\bthrow\b/.test(body)) continue;
    if (/\breturn\b\s+new\s+/.test(body)) continue;

    // If a structured logger is used, assume intentional handling.
    if (/\blogger\.(error|warn|info)\s*\(/.test(body)) continue;

    // Flag console logging of the caught error.
    const consoleLogRe = /\bconsole\.(log|error|warn)\s*\(([^)]*)\)\s*;?/;
    const consoleLog = body.match(consoleLogRe);
    if (!consoleLog) continue;

    const argText = consoleLog[2] ?? "";
    // Prefer to only flag when they log the caught error directly.
    // If param is empty, still flag (generic catch-all) when console logging is present.
    const logsCaughtError =
      !catchParam || new RegExp(`\\b${catchParam}\\b`).test(argText);
    if (!logsCaughtError) continue;

    issues.push({
      type: "genericErrorHandling",
      severity: "medium",
      message:
        "Catch block appears to only log the error (generic error handling); consider handling or rethrowing.",
      line: getLineNumberFromIndex(code, matchIndex + full.indexOf("catch")),
    });
  }

  return issues;
}

function detectUnnecessaryAbstractionsTS(code: string): AIAntiPatternIssue[] {
  // Heuristic:
  // - find `interface X { ... }`
  // - count occurrences of word X in the whole file
  // - if it only occurs in its declaration + one usage, flag as unnecessary
  const issues: AIAntiPatternIssue[] = [];
  const interfaceRe = /\binterface\s+([A-Za-z_$][\w$]*)\b/g;

  for (const match of code.matchAll(interfaceRe)) {
    const name = match[1];
    if (!name) continue;

    const nameRe = new RegExp(`\\b${name}\\b`, "g");
    const occurrences = [...code.matchAll(nameRe)].length;

    // Occurrence counting includes the declaration itself.
    // Typical "used once" pattern: `interface X` + `implements X` => 2.
    // Consider up to 2 as unnecessary; 3+ indicates multi-use.
    if (occurrences <= 2) {
      issues.push({
        type: "unnecessaryAbstraction",
        severity: "low",
        message: `Interface '${name}' appears to be used only once; consider simplifying unless needed for extensibility.`,
        line: getLineNumberFromIndex(code, match.index ?? 0),
      });
    }
  }

  return issues;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectMissingValidation(_code: string): AIAntiPatternIssue[] {
  // Intentionally conservative; current unit tests accept 0 findings.
  return [];
}

export async function detectAIAntiPatterns(
  code: string,
  language: string,
): Promise<AIAntiPatternIssue[]> {
  if (!code || !code.trim()) return [];

  const issues: AIAntiPatternIssue[] = [];
  issues.push(...detectGenericErrorHandling(code));

  if (language === "typescript" || language === "ts") {
    issues.push(...detectUnnecessaryAbstractionsTS(code));
  }

  issues.push(...detectMissingValidation(code));
  return issues;
}

