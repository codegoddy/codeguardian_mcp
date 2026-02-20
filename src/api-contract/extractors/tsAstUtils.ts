/**
 * API Contract Guardian - TypeScript AST Utilities
 *
 * Shared Tree-sitter helpers for extracting:
 * - HTTP methods from call expressions
 * - endpoints from string/template_string arguments
 * - enclosing function/property names
 *
 * Used by both:
 * - `src/api-contract/extractors/typescript.ts`
 * - `src/context/apiContractExtraction.ts`
 *
 * @format
 */

import type { QueryParam } from "../types.js";

// Keep backward-compatible named export for any external callers.
export type { QueryParam } from "../types.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function getNodeText(node: any, content: string): string {
  if (!node) return "";
  return content.slice(node.startIndex, node.endIndex);
}

export function mapToHttpMethod(methodName: string): HttpMethod | null {
  const methodMap: Record<string, HttpMethod> = {
    get: "GET",
    post: "POST",
    put: "PUT",
    patch: "PATCH",
    delete: "DELETE",
  };
  return methodMap[methodName.toLowerCase()] || null;
}

export function extractHttpMethodFromArguments(
  argumentsNode: any,
  content: string,
): HttpMethod | null {
  for (const child of argumentsNode?.children || []) {
    if (child?.type === "object") {
      return extractMethodFromObject(child, content);
    }
  }
  return null;
}

function extractMethodFromObject(node: any, content: string): HttpMethod | null {
  for (const child of node?.children || []) {
    if (child?.type !== "pair") continue;
    const keyNode = child.childForFieldName?.("key");
    const valueNode = child.childForFieldName?.("value");
    if (!keyNode || !valueNode) continue;

    const key = getNodeText(keyNode, content);
    if (key !== "method") continue;

    const raw = getNodeText(valueNode, content).trim();
    const cleaned = raw.replace(/^['"`]/, "").replace(/['"`]$/, "");
    return mapToHttpMethod(cleaned);
  }
  return null;
}

export function extractEndpointFromArguments(
  argumentsNode: any,
  content: string,
): { endpoint: string; queryParams: QueryParam[] } | null {
  // First argument should be the endpoint
  for (const child of argumentsNode?.children || []) {
    if (child?.type === "string" || child?.type === "template_string") {
      const result = extractStringValue(child, content);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Extract a URL/endpoint from a string or template_string node.
 *
 * For template strings, reconstruct a stable path with placeholders.
 * Examples:
 * - `/api/clients/${id}` -> `/api/clients/{id}`
 * - `/pantry${category ? '?cat=...' : ''}` -> `/pantry`
 */
export function extractStringValue(
  node: any,
  content: string,
): { endpoint: string; queryParams: QueryParam[] } | null {
  const stripUrlOrigin = (raw: string): string => {
    const s = (raw || "").trim();
    if (!s) return s;
    // Handle absolute URLs so contract matching works when frontend uses full base URLs.
    // Examples:
    // - http://localhost:3000/api/users/{id} -> /api/users/{id}
    // - https://example.com/api/users -> /api/users
    const m = s.match(/^https?:\/\/[^/]+(\/.*)$/i);
    if (m && m[1]) return m[1];
    return s;
  };

  if (node?.type === "string") {
    const text = getNodeText(node, content).trim();
    const cleaned = text.replace(/^['"`]/, "").replace(/['"`]$/, "");
    const normalized = stripUrlOrigin(cleaned);
    const queryParams = extractQueryParamsFromUrl(normalized);
    let endpoint = normalized.split("?")[0].replace(/\/$/, "");
    if (!endpoint || endpoint === "/") return null;
    return { endpoint, queryParams };
  }

  if (node?.type === "template_string") {
    const parts: string[] = [];
    const inferredQueryParams = new Set<string>();
    let hasStaticPathFragment = false;

    for (const child of node.children || []) {
      if (child?.type === "string_fragment") {
        const fragment = getNodeText(child, content);
        if (fragment.includes("/")) {
          hasStaticPathFragment = true;
        }
        parts.push(fragment);
        continue;
      }

      if (child?.type === "template_substitution") {
        const exprNode = child.children?.find(
          (c: any) => c?.type !== "${" && c?.type !== "}",
        );
        if (!exprNode) continue;

        const exprText = getNodeText(exprNode, content).trim();
        // Skip query string builders (commonly appended at end)
        if (/^(query|params|searchParams|queryString)$/i.test(exprText)) continue;
        // Infer optional query params from ternary builders like:
        // category ? `?category=${category}` : ''
        // status ? `&status=${status}` : ''
        if (exprNode.type === "ternary_expression") {
          for (const name of extractQueryParamNamesFromText(exprText)) {
            inferredQueryParams.add(name);
          }
          continue;
        }

        // Stable placeholder for simple identifiers
        if (exprNode.type === "identifier") {
          const snakeCase = exprText.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
          parts.push(`{${snakeCase}}`);
        }
      }
    }

    if (parts.length === 0) return null;

    // Dynamic wrappers like `${BASE_URL}${endpoint}` do not provide a stable
    // path segment for contract matching. Skip extraction rather than emitting
    // placeholder endpoints that create false positives.
    if (!hasStaticPathFragment) {
      return null;
    }

    let fullUrl = stripUrlOrigin(parts.join(""));

    // If the template starts with dynamic placeholders (e.g., `${BASE_URL}/api/...`),
    // trim everything before the first concrete slash and keep the stable path.
    if (fullUrl.startsWith("{")) {
      const firstSlash = fullUrl.indexOf("/");
      if (firstSlash === -1) return null;
      fullUrl = fullUrl.slice(firstSlash);
    }

    const queryParams = extractQueryParamsFromUrl(fullUrl);
    for (const name of inferredQueryParams) {
      if (!queryParams.some((p) => p.name === name)) {
        queryParams.push({ name, type: "string", required: false });
      }
    }
    let endpoint = fullUrl.split("?")[0].replace(/\/$/, "");
    if (!endpoint || endpoint === "/") return null;
    return { endpoint, queryParams };
  }

  return null;
}

function extractQueryParamsFromUrl(url: string): QueryParam[] {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return [];

  const queryString = url.substring(queryStart + 1);
  const params: QueryParam[] = [];

  for (const pair of queryString.split("&")) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = pair.substring(0, eqIndex).trim();
    if (name && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      params.push({ name, type: "string", required: true });
    }
  }

  return params;
}

function extractQueryParamNamesFromText(text: string): string[] {
  const names = new Set<string>();
  const re = /[?&]([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    names.add(match[1]);
  }

  return Array.from(names);
}

/**
 * Find the nearest enclosing function-like name for an AST node.
 *
 * Supports:
 * - function_declaration
 * - variable_declarator (arrow function assigned to const)
 * - method_definition
 * - object properties (pair/property_definition)
 */
export function findEnclosingFunctionName(node: any, content: string): string | null {
  let current = node;

  while (current) {
    if (current.type === "function_declaration") {
      const nameNode = current.childForFieldName?.("name");
      if (nameNode) return getNodeText(nameNode, content);
    }

    if (current.type === "variable_declarator") {
      // Only treat variable names as function names when they actually
      // define a function (e.g., const getUser = async () => ...).
      // Avoid picking up local variables like `const response = await fetch(...)`.
      const valueNode = current.childForFieldName?.("value");
      const isFunctionValue = valueNode?.type === "arrow_function" || valueNode?.type === "function";
      if (isFunctionValue) {
        const nameNode = current.childForFieldName?.("name");
        if (nameNode) return getNodeText(nameNode, content);
      }
    }

    if (current.type === "method_definition") {
      const nameNode = current.childForFieldName?.("name");
      if (nameNode) return getNodeText(nameNode, content);
    }

    if (current.type === "property_definition" || current.type === "pair") {
      const valueNode = current.childForFieldName?.("value");
      const isFunctionValue = valueNode?.type === "arrow_function" || valueNode?.type === "function";
      if (isFunctionValue) {
        const keyNode =
          current.childForFieldName?.("key") || current.childForFieldName?.("name");
        if (keyNode) return getNodeText(keyNode, content);
      }
    }

    current = current.parent;
  }

  return null;
}
