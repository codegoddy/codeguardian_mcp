/**
 * Contextual Naming Heuristics Module
 *
 * This module implements "Trust but Verify" logic for common naming conventions.
 * It recognizes intent-based variable names and auto-whitelists their expected methods.
 *
 * Key Features:
 * - Event handler detection (e, event, evt variables)
 * - Framework-specific patterns (React SyntheticEvent, DOM Event API)
 * - Extensible pattern matching for team conventions
 *
 * @format
 */

import type { ASTUsage } from "./types.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Represents a contextual naming pattern that should be trusted
 */
export interface NamingPattern {
  /** Regex pattern to match variable names */
  variablePattern: RegExp;
  /** Methods/properties that should be auto-whitelisted for this pattern */
  allowedMembers: Set<string>;
  /** Description of what this pattern represents */
  description: string;
  /** Optional: Context where this pattern applies (e.g., "eventHandler") */
  context?: string;
}

// ============================================================================
// Built-in Patterns
// ============================================================================

/**
 * Event handler patterns - recognizes common event variable names
 */
const EVENT_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(e|evt|event)$/i,
    allowedMembers: new Set([
      // Standard DOM Event API
      "preventDefault",
      "stopPropagation",
      "stopImmediatePropagation",
      "target",
      "currentTarget",
      "type",
      "bubbles",
      "cancelable",
      "defaultPrevented",
      "eventPhase",
      "isTrusted",
      "timeStamp",
      // Mouse events
      "clientX",
      "clientY",
      "pageX",
      "pageY",
      "screenX",
      "screenY",
      "button",
      "buttons",
      "relatedTarget",
      // Keyboard events
      "key",
      "code",
      "keyCode",
      "charCode",
      "altKey",
      "ctrlKey",
      "metaKey",
      "shiftKey",
      "repeat",
      // React SyntheticEvent
      "nativeEvent",
      "persist",
      "isPropagationStopped",
      "isDefaultPrevented",
      // Form events
      "value",
      "checked",
      "files",
      // Touch events
      "touches",
      "targetTouches",
      "changedTouches",
      // Wheel events
      "deltaX",
      "deltaY",
      "deltaZ",
      "deltaMode",
    ]),
    description: "Event handler variable (e, event, evt)",
    context: "eventHandler",
  },
];

/**
 * Request/Response patterns - recognizes HTTP request/response objects
 */
const HTTP_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(req|request)$/i,
    allowedMembers: new Set([
      // Express/Node.js Request
      "body",
      "params",
      "query",
      "headers",
      "method",
      "url",
      "path",
      "cookies",
      "session",
      "user",
      "get",
      "header",
      "accepts",
      "is",
      "ip",
      "protocol",
      "secure",
      "xhr",
      "baseUrl",
      "originalUrl",
      "hostname",
      "subdomains",
      // Fetch API Request
      "json",
      "text",
      "blob",
      "arrayBuffer",
      "formData",
      "clone",
      "signal",
      "cache",
      "credentials",
      "destination",
      "integrity",
      "mode",
      "redirect",
      "referrer",
      "referrerPolicy",
    ]),
    description: "HTTP request object (req, request)",
    context: "httpHandler",
  },
  {
    variablePattern: /^(res|response)$/i,
    allowedMembers: new Set([
      // Express/Node.js Response
      "status",
      "send",
      "json",
      "redirect",
      "render",
      "end",
      "set",
      "header",
      "get",
      "cookie",
      "clearCookie",
      "type",
      "sendFile",
      "download",
      "attachment",
      "links",
      "location",
      "vary",
      "append",
      "locals",
      "headersSent",
      "statusCode",
      "statusMessage",
      // Fetch API Response
      "ok",
      "redirected",
      "text",
      "blob",
      "arrayBuffer",
      "formData",
      "clone",
      "body",
      "bodyUsed",
      "headers",
      "url",
    ]),
    description: "HTTP response object (res, response)",
    context: "httpHandler",
  },
];

/**
 * Error handling patterns - recognizes error/exception variables
 */
const ERROR_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(err|error|exception|ex)$/i,
    allowedMembers: new Set([
      // Standard Error properties
      "message",
      "name",
      "stack",
      "cause",
      // Node.js Error extensions
      "code",
      "errno",
      "syscall",
      "path",
      // Custom error properties (common patterns)
      "statusCode",
      "status",
      "details",
      "errors",
      "data",
      "response",
      "request",
      "config",
      "isAxiosError",
      "toJSON",
      "toString",
    ]),
    description: "Error/exception object (err, error, exception, ex)",
    context: "errorHandler",
  },
];

/**
 * Context patterns - recognizes context objects (React, Vue, etc.)
 */
const CONTEXT_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(ctx|context)$/i,
    allowedMembers: new Set([
      // React Context
      "Provider",
      "Consumer",
      // Canvas Context
      "fillRect",
      "strokeRect",
      "clearRect",
      "fillText",
      "strokeText",
      "measureText",
      "drawImage",
      "createImageData",
      "getImageData",
      "putImageData",
      "save",
      "restore",
      "scale",
      "rotate",
      "translate",
      "transform",
      "setTransform",
      "resetTransform",
      "beginPath",
      "closePath",
      "moveTo",
      "lineTo",
      "bezierCurveTo",
      "quadraticCurveTo",
      "arc",
      "arcTo",
      "ellipse",
      "rect",
      "fill",
      "stroke",
      "clip",
      "isPointInPath",
      "isPointInStroke",
      "fillStyle",
      "strokeStyle",
      "lineWidth",
      "lineCap",
      "lineJoin",
      "miterLimit",
      "font",
      "textAlign",
      "textBaseline",
      "direction",
      "globalAlpha",
      "globalCompositeOperation",
      "shadowBlur",
      "shadowColor",
      "shadowOffsetX",
      "shadowOffsetY",
      // Koa/Express context
      "request",
      "response",
      "req",
      "res",
      "app",
      "state",
      "throw",
      "assert",
      "redirect",
    ]),
    description: "Context object (ctx, context)",
    context: "contextObject",
  },
];

/**
 * All built-in patterns combined
 */
const ALL_PATTERNS: NamingPattern[] = [
  ...EVENT_PATTERNS,
  ...HTTP_PATTERNS,
  ...ERROR_PATTERNS,
  ...CONTEXT_PATTERNS,
];

// ============================================================================
// Pattern Matching Logic
// ============================================================================

/**
 * Check if a method call should be whitelisted based on contextual naming patterns
 *
 * @param usage - The method call usage to check
 * @param customPatterns - Optional custom patterns to check in addition to built-ins
 * @returns true if the method call matches a trusted pattern, false otherwise
 */
export function isContextuallyValid(
  usage: ASTUsage,
  customPatterns: NamingPattern[] = [],
): boolean {
  // Only check method calls
  if (usage.type !== "methodCall" || !usage.object) {
    return false;
  }

  const objectName = usage.object;
  const methodName = usage.name;

  // Check all patterns (built-in + custom)
  const patterns = [...ALL_PATTERNS, ...customPatterns];

  for (const pattern of patterns) {
    // Check if the object name matches the pattern
    if (pattern.variablePattern.test(objectName)) {
      // Check if the method is in the allowed list
      if (pattern.allowedMembers.has(methodName)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get a description of why a method call is contextually valid
 *
 * @param usage - The method call usage
 * @param customPatterns - Optional custom patterns
 * @returns Description string or null if not contextually valid
 */
export function getContextualReason(
  usage: ASTUsage,
  customPatterns: NamingPattern[] = [],
): string | null {
  if (usage.type !== "methodCall" || !usage.object) {
    return null;
  }

  const objectName = usage.object;
  const methodName = usage.name;
  const patterns = [...ALL_PATTERNS, ...customPatterns];

  for (const pattern of patterns) {
    if (pattern.variablePattern.test(objectName)) {
      if (pattern.allowedMembers.has(methodName)) {
        return `${pattern.description} - '${methodName}' is a standard method`;
      }
    }
  }

  return null;
}

/**
 * Filter out contextually valid usages from a list of usages
 * This reduces false positives by removing method calls that match trusted patterns
 *
 * @param usages - Array of all usages
 * @param customPatterns - Optional custom patterns
 * @returns Filtered array with contextually valid usages removed
 */
export function filterContextualUsages(
  usages: ASTUsage[],
  customPatterns: NamingPattern[] = [],
): ASTUsage[] {
  return usages.filter((usage) => !isContextuallyValid(usage, customPatterns));
}

/**
 * Get statistics about contextual filtering
 *
 * @param originalUsages - Original usage array
 * @param filteredUsages - Filtered usage array
 * @returns Statistics object
 */
export function getFilterStats(
  originalUsages: ASTUsage[],
  filteredUsages: ASTUsage[],
): {
  total: number;
  filtered: number;
  remaining: number;
  filterRate: number;
} {
  const total = originalUsages.length;
  const remaining = filteredUsages.length;
  const filtered = total - remaining;
  const filterRate = total > 0 ? (filtered / total) * 100 : 0;

  return {
    total,
    filtered,
    remaining,
    filterRate: Math.round(filterRate * 10) / 10,
  };
}

// ============================================================================
// Pattern Builder Utilities
// ============================================================================

/**
 * Create a custom naming pattern
 *
 * @param config - Pattern configuration
 * @returns NamingPattern object
 */
export function createPattern(config: {
  variablePattern: RegExp | string;
  allowedMembers: string[];
  description: string;
  context?: string;
}): NamingPattern {
  return {
    variablePattern:
      typeof config.variablePattern === "string" ?
        new RegExp(config.variablePattern)
      : config.variablePattern,
    allowedMembers: new Set(config.allowedMembers),
    description: config.description,
    context: config.context,
  };
}

/**
 * Export built-in patterns for inspection/extension
 */
export const BUILTIN_PATTERNS = {
  EVENT_PATTERNS,
  HTTP_PATTERNS,
  ERROR_PATTERNS,
  CONTEXT_PATTERNS,
  ALL_PATTERNS,
};
