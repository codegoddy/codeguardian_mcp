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
    variablePattern: /^(e|err|error|exception|ex)$/i,
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
      // Python Exception methods/properties
      "with_traceback",
      "args",
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
 * Date/Time patterns - recognizes temporal variable names
 * This is part of the "Common Sense Standard Library" - Vibe coders use intuitive names!
 */
const DATE_PATTERNS: NamingPattern[] = [
  {
    // Match: today, tomorrow, yesterday, date, startDate, endDate, createdAt, updatedAt, etc.
    variablePattern: /^(today|tomorrow|yesterday|now|date|datetime|time|timestamp|(start|end|created|updated|deleted|modified|expires?|birth|due)(Date|Time|At)?|(date|time)(Start|End|From|To|Of|At)?)$/i,
    allowedMembers: new Set([
      // Date instance methods - the core ones that caused false positives!
      "getDate",
      "getDay",
      "getFullYear",
      "getHours",
      "getMilliseconds",
      "getMinutes",
      "getMonth",
      "getSeconds",
      "getTime",
      "getTimezoneOffset",
      "getUTCDate",
      "getUTCDay",
      "getUTCFullYear",
      "getUTCHours",
      "getUTCMilliseconds",
      "getUTCMinutes",
      "getUTCMonth",
      "getUTCSeconds",
      "getYear",
      "setDate",
      "setFullYear",
      "setHours",
      "setMilliseconds",
      "setMinutes",
      "setMonth",
      "setSeconds",
      "setTime",
      "setUTCDate",
      "setUTCFullYear",
      "setUTCHours",
      "setUTCMilliseconds",
      "setUTCMinutes",
      "setUTCMonth",
      "setUTCSeconds",
      "setYear",
      "toDateString",
      "toISOString",
      "toJSON",
      "toLocaleDateString",
      "toLocaleString",
      "toLocaleTimeString",
      "toString",
      "toTimeString",
      "toUTCString",
      "valueOf",
      // Dayjs/Moment.js methods (common in vibe coding)
      "format",
      "add",
      "subtract",
      "startOf",
      "endOf",
      "diff",
      "isBefore",
      "isAfter",
      "isSame",
      "isValid",
      "clone",
      "unix",
      "utc",
      "local",
      "locale",
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
      "millisecond",
      "week",
      "weekday",
      "dayOfYear",
      "quarter",
      "daysInMonth",
      "toDate",
      "toArray",
      "toObject",
      // Python Date/Time methods
      "strftime",
      "strptime",
      "isoformat",
      "replace",
      "astimezone",
      "timestamp",
      "weekday",
      "isoweekday",
      "now",
      "today",
      "fromtimestamp",
      "utcfromtimestamp",
      "combine",
      "date",
      "time",
      "timetz",
      "tzname",
      "utcoffset",
      "dst",
      "fromisoformat",
    ]),
    description: "Date/time variable (today, tomorrow, date, createdAt, etc.)",
    context: "dateTime",
  },
];

/**
 * Array patterns - recognizes collection/array variable names
 * This is part of the "Common Sense Standard Library"
 * Variables named "items", "results", "list", etc. are almost always arrays!
 */
const ARRAY_PATTERNS: NamingPattern[] = [
  {
    // Match: items, results, list, data, users, todos, products, entries, records, rows, etc.
    // Also catches plurals like "users", "todos", "products" which are nearly always arrays
    variablePattern: /^(items?|results?|list|data|users?|todos?|products?|entries|records?|rows?|elements?|values?|keys?|options?|choices?|selections?|children|nodes?|files?|images?|documents?|messages?|comments?|posts?|articles?|orders?|transactions?|events?|tasks?|projects?|members?|participants?|attendees?|friends?|followers?|tags?|categories?|groups?|teams?|roles?|permissions?|settings?|preferences?|logs?|errors?|warnings?|notifications?|alerts?|updates?|changes?|diffs?|patches?|versions?|snapshots?|backups?|exports?|imports?|uploads?|downloads?|responses?|requests?|queries?|mutations?|subscriptions?|hooks?|callbacks?|handlers?|listeners?|observers?|watchers?|middlewares?|plugins?|extensions?|modules?|packages?|dependencies?|devDependencies?|peerDependencies?|scripts?|commands?|args?|argv|params?|arguments?|props?|attributes?|properties?|fields?|columns?|headers?|footers?|sections?|pages?|slides?|frames?|layers?|components?|widgets?|controls?|inputs?|outputs?|streams?|buffers?|chunks?|batches?|collections?|sets?|maps?|pairs?|tuples?|matches?|hits?|scores?|points?|coordinates?|positions?|locations?|addresses?|routes?|paths?|urls?|links?|refs?|references?|citations?|sources?|destinations?|targets?|origins?|endpoints?|apis?|services?|resources?|assets?|media|contents?|bodies?|payloads?|fragments?|segments?|parts?|pieces?|slices?|ranges?|intervals?|periods?|durations?|spans?|gaps?|spaces?|slots?|holes?|vacancies?|availabilities?|stocks?|inventories?|supplies?|demands?|offers?|bids?|asks?|prices?|costs?|fees?|taxes?|discounts?|coupons?|vouchers?|credits?|debits?|balances?|totals?|sums?|counts?|amounts?|quantities?|numbers?|digits?|integers?|floats?|decimals?|ratios?|percentages?|rates?|speeds?|velocities?|accelerations?|forces?|weights?|masses?|volumes?|areas?|lengths?|widths?|heights?|depths?|radii?|diameters?|circumferences?|perimeters?|angles?|degrees?|radians?|gradients?|slopes?|curves?|arcs?|lines?|rays?|vectors?|matrices?|tensors?|arrays?|queues?|stacks?|heaps?|trees?|graphs?|networks?|meshes?|grids?|tables?|charts?|plots?|diagrams?|drawings?|shapes?|figures?|symbols?|icons?|emojis?|avatars?|thumbnails?|previews?|galleries?|albums?|playlists?|tracks?|songs?|videos?|movies?|shows?|episodes?|seasons?|series?|franchises?|brands?|labels?|names?|titles?|descriptions?|summaries?|abstracts?|excerpts?|quotes?|captions?|subtitles?|transcripts?|translations?|languages?|locales?|currencies?|countries?|regions?|states?|cities?|towns?|villages?|neighborhoods?|districts?|zones?|areas?|sectors?|domains?|realms?|worlds?|universes?|dimensions?|levels?|tiers?|grades?|ranks?|ratings?|reviews?|feedback|testimonials?|recommendations?)$/i,
    allowedMembers: new Set([
      // Array instance methods - the most common ones
      "push",
      "pop",
      "shift",
      "unshift",
      "splice",
      "slice",
      "concat",
      "join",
      "reverse",
      "sort",
      "filter",
      "map",
      "reduce",
      "reduceRight",
      "forEach",
      "every",
      "some",
      "find",
      "findIndex",
      "findLast",
      "findLastIndex",
      "indexOf",
      "lastIndexOf",
      "includes",
      "flat",
      "flatMap",
      "fill",
      "copyWithin",
      "entries",
      "keys",
      "values",
      "at",
      "with",
      "toReversed",
      "toSorted",
      "toSpliced",
      // Python List methods
      "append",
      "extend",
      "insert",
      "remove",
      "count",
      "index",
      "clear",
      "copy",
      // Array properties
      "length",
      // Common array-like operations (lodash, underscore, etc.)
      "first",
      "last",
      "head",
      "tail",
      "take",
      "drop",
      "chunk",
      "compact",
      "uniq",
      "unique",
      "union",
      "intersection",
      "difference",
      "without",
      "zip",
      "unzip",
      "flatten",
      "groupBy",
      "sortBy",
      "orderBy",
      "countBy",
      "partition",
      "sample",
      "shuffle",
      "size",
      "isEmpty",
      "isNotEmpty",
      // Iteration (iterator protocol)
      "next",
      "done",
      "value",
      // Immutable.js / Immer patterns
      "toJS",
      "toArray",
      "toList",
      "toSet",
      "toMap",
      "get",
      "set",
      "update",
      "delete",
      "has",
      "clear",
      "merge",
    ]),
    description: "Array/collection variable (items, results, list, data, etc.)",
    context: "collection",
  },
];

/**
 * Promise/Async patterns - recognizes promise and async result variables
 * Variables like "promise", "deferred", "pending" are almost always Promises
 */
const PROMISE_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(promise|promises?|deferred|pending|awaited|async|future|futures?)$/i,
    allowedMembers: new Set([
      // Promise instance methods
      "then",
      "catch",
      "finally",
      // Promise properties
      "resolve",
      "reject",
      // Bluebird/Q extensions
      "spread",
      "tap",
      "delay",
      "timeout",
      "cancel",
      "isFulfilled",
      "isRejected",
      "isPending",
      "isCancelled",
      "value",
      "reason",
    ]),
    description: "Promise/async variable (promise, deferred, pending, etc.)",
    context: "async",
  },
];

/**
 * Map/Object patterns - recognizes dictionary/map variable names
 */
const MAP_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(map|maps?|dictionary|dict|dicts?|hash|hashes?|cache|caches?|store|stores?|registry|registries?|lookup|lookups?|index|indexes?|indices?|data|config|configuration|payload|body|state|props|context|options|settings?|preferences?)$/i,
    allowedMembers: new Set([
      // Map instance methods
      "get",
      "set",
      "has",
      "delete",
      "clear",
      "forEach",
      "entries",
      "keys",
      "values",
      "size",
      // Python Dict methods
      "items",
      "update",
      "pop",
      "popitem",
      "setdefault",
      "copy",
      "fromkeys",
      // WeakMap methods
      "has",
      // Object methods commonly used on maps
      "assign",
      "freeze",
      "seal",
      "isFrozen",
      "isSealed",
      // Common patterns
      "toJSON",
      "toString",
      "valueOf",
    ]),
    description: "Map/dictionary variable (map, cache, store, lookup, etc.)",
    context: "map",
  },
];

/**
 * Set patterns - recognizes set/collection variable names
 */
const SET_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(set|sets?|uniqueItems?|distinctValues?|visited|seen|processed|excluded|included|allowed|blocked|whitelist|blacklist|allowlist|denylist|permissions?Set|roleSet|tagSet|categorySet)$/i,
    allowedMembers: new Set([
      // Set instance methods
      "add",
      "delete",
      "has",
      "clear",
      "forEach",
      "entries",
      "keys",
      "values",
      "size",
      // Python Set methods
      "remove",
      "discard",
      "pop",
      "copy",
      "update",
      "union",
      "intersection",
      "difference",
      "symmetric_difference",
      "isdisjoint",
      "issubset",
      "issuperset",
      // Set operations (proposed, polyfilled)
      "union",
      "intersection",
      "difference",
      "symmetricDifference",
      "isSubsetOf",
      "isSupersetOf",
      "isDisjointFrom",
    ]),
    description: "Set variable (set, visited, seen, whitelist, etc.)",
    context: "set",
  },
];

/**
 * String patterns - recognizes string variable names that hint at string type
 */
const STRING_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(str|string|text|content|message|msg|label|title|name|description|desc|body|subject|summary|excerpt|caption|alt|placeholder|hint|tooltip|prefix|suffix|delimiter|separator|pattern|regex|regexp|template|format|encoded|decoded|escaped|sanitized|trimmed|lowercased|uppercased|capitalized|slug|token|hash|digest|signature|checksum|uuid|guid|id|key|code|password|secret|salt|nonce|iv)$/i,
    allowedMembers: new Set([
      // String instance methods
      "charAt",
      "charCodeAt",
      "codePointAt",
      "concat",
      "endsWith",
      "includes",
      "indexOf",
      "lastIndexOf",
      "localeCompare",
      "match",
      "matchAll",
      "normalize",
      "padEnd",
      "padStart",
      "repeat",
      "replace",
      "replaceAll",
      "search",
      "slice",
      "split",
      "startsWith",
      "substring",
      "toLocaleLowerCase",
      "toLocaleUpperCase",
      "toLowerCase",
      "toUpperCase",
      "toString",
      "trim",
      "trimEnd",
      "trimStart",
      "trimLeft",
      "trimRight",
      "valueOf",
      "at",
      // Python String methods
      "capitalize",
      "casefold",
      "center",
      "count",
      "encode",
      "endswith",
      "expandtabs",
      "find",
      "format",
      "format_map",
      "index",
      "isalnum",
      "isalpha",
      "isascii",
      "isdecimal",
      "isdigit",
      "isidentifier",
      "islower",
      "isnumeric",
      "isprintable",
      "isspace",
      "istitle",
      "isupper",
      "join",
      "ljust",
      "lower",
      "lstrip",
      "maketrans",
      "partition",
      "removeprefix",
      "removesuffix",
      "rfind",
      "rindex",
      "rjust",
      "rpartition",
      "rsplit",
      "rstrip",
      "splitlines",
      "startswith",
      "strip",
      "swapcase",
      "title",
      "translate",
      "upper",
      "zfill",
      // String properties
      "length",
      // Common string operations
      "toJSON",
    ]),
    description: "String variable (str, text, message, label, etc.)",
    context: "string",
  },
];

/**
 * Number patterns - recognizes numeric variable names
 */
const NUMBER_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(count|total|sum|amount|score|percent|percentage|index|offset|delta|ratio|progress|value|length|width|height|depth|radius|diameter|size|capacity|volume|mass|weight|price|cost|fee|tax|discount|balance|credit|debit)$/i,
    allowedMembers: new Set([
      "toFixed",
      "toPrecision",
      "toExponential",
      "toString",
      "valueOf",
      "toLocaleString",
    ]),
    description: "Numeric variable (count, total, percent, etc.)",
    context: "number",
  },
];

/**
 * React Ref patterns - recognizes ref objects
 */
const REF_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(ref|.+Ref)$/i, 
    allowedMembers: new Set([
      "current",
    ]),
    description: "React Ref object (ref, inputRef, etc.)",
    context: "reactRef",
  },
];

/**
 * Router patterns - recognizes Next.js/React Router objects
 */
const ROUTER_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(router|navigation)$/i,
    allowedMembers: new Set([
      "push",
      "replace",
      "back",
      "forward",
      "refresh",
      "prefetch",
      "replace",
      "go",
      "createHref",
      "events",
    ]),
    description: "Router object (router, navigation)",
    context: "router",
  },
];

/**
 * Environment patterns - recognizes env objects
 */
const ENV_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(env|environment|process\.env|import\.meta\.env)$/i,
    allowedMembers: new Set([
      "NODE_ENV",
      "VERCEL",
      "NEXT_PUBLIC_",
      "VITE_",
    ]),
    description: "Environment variables",
    context: "env",
  },
];

/**
 * Form patterns - recognizes form handling objects (React Hook Form, Formik)
 */
const FORM_PATTERNS: NamingPattern[] = [
  {
    variablePattern: /^(form|methods?|useForm)$/i,
    allowedMembers: new Set([
      "register",
      "control",
      "handleSubmit",
      "watch",
      "getValues",
      "setValue",
      "reset",
      "trigger",
      "setError",
      "clearErrors",
      "formState",
      "getFieldState",
    ]),
    description: "Form handler object",
    context: "form",
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
  ...DATE_PATTERNS,
  ...ARRAY_PATTERNS,
  ...PROMISE_PATTERNS,
  ...MAP_PATTERNS,
  ...SET_PATTERNS,
  ...STRING_PATTERNS,
  ...NUMBER_PATTERNS,
  ...REF_PATTERNS,
  ...ROUTER_PATTERNS,
  ...ENV_PATTERNS,
  ...FORM_PATTERNS,
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
  // "Common Sense" Standard Library patterns
  DATE_PATTERNS,
  ARRAY_PATTERNS,
  PROMISE_PATTERNS,
  MAP_PATTERNS,
  SET_PATTERNS,
  STRING_PATTERNS,
  ALL_PATTERNS,
};
