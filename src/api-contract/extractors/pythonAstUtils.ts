/**
 * API Contract Guardian - Python AST Utilities
 *
 * Tree-sitter powered extraction for Python backends.
 *
 * Goals:
 * - Prefer AST for correctness (avoid matching commented code)
 * - Provide a shared implementation for both legacy api-contract module and
 *   integrated context extraction.
 * - Keep a regex fallback in callers for patterns not yet covered.
 *
 * @format
 */

import { getParser } from "../../tools/validation/parser.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface QueryParam {
  name: string;
  type: string;
  required: boolean;
}

export interface ExtractedRoute {
  method: HttpMethod;
  path: string;
  handler: string;
  requestModel?: string;
  responseModel?: string;
  queryParams?: QueryParam[];
  line: number;
}

export interface ExtractedModelField {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
}

export interface ExtractedModel {
  name: string;
  fields: ExtractedModelField[];
  baseClasses?: string[];
  line: number;
}

export function extractRoutesFromPythonAST(
  content: string,
  filePath: string,
  framework: string,
): ExtractedRoute[] {
  // Only frameworks with decorator-based routing are supported here.
  if (framework !== "fastapi" && framework !== "flask") return [];

  const parser = getParser("python");
  const tree = parser.parse(content);
  const root: any = tree.rootNode;

  const routerPrefixByVar = framework === "fastapi" ? extractRouterPrefixesAST(root, content) : new Map<string, string>();

  const routes: ExtractedRoute[] = [];

  const visit = (node: any) => {
    if (!node) return;

    if (node.type === "function_definition") {
      const decorators = getDecorators(node, content);
      if (decorators.length > 0) {
        const fnNameNode = node.childForFieldName?.("name");
        const handler = fnNameNode ? getNodeText(fnNameNode, content) : "";
        const line = (node.startPosition?.row ?? 0) + 1;

        for (const decoratorNode of decorators) {
          const route = extractRouteFromDecorator(
            decoratorNode,
            node,
            content,
            framework,
            routerPrefixByVar,
            handler,
            line,
          );
          if (route) routes.push(route);
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(root);

  // Attach filePath late to keep util generic; callers may use filePath separately.
  // Here we embed it into the path-normalization step only (no file field on ExtractedRoute).
  return routes;
}

export function extractPydanticModelsFromPythonAST(
  content: string,
  filePath: string,
): ExtractedModel[] {
  const parser = getParser("python");
  const tree = parser.parse(content);
  const root: any = tree.rootNode;

  const models: ExtractedModel[] = [];

  const visit = (node: any) => {
    if (!node) return;

    if (node.type === "class_definition") {
      const nameNode = node.childForFieldName?.("name");
      const name = nameNode ? getNodeText(nameNode, content) : "";
      const line = (node.startPosition?.row ?? 0) + 1;

      const baseClasses = getClassBaseClasses(node, content);
      if (!isPydanticBaseClass(baseClasses)) {
        for (const child of node.children || []) visit(child);
        return;
      }

      const fields = extractPydanticFieldsFromClass(node, content);
      models.push({ name, fields, baseClasses, line });

      // Still recurse to catch nested classes
      for (const child of node.children || []) visit(child);
      return;
    }

    for (const child of node.children || []) visit(child);
  };

  visit(root);
  return models;
}

// ============================================================================
// Route extraction helpers
// ============================================================================

function extractRouterPrefixesAST(root: any, content: string): Map<string, string> {
  const prefixes = new Map<string, string>();

  const visit = (node: any) => {
    if (!node) return;
    if (node.type === "assignment") {
      const left = node.childForFieldName?.("left");
      const right = node.childForFieldName?.("right");
      if (left?.type === "identifier" && right?.type === "call") {
        const funcNode = right.childForFieldName?.("function");
        const funcText = funcNode ? getNodeText(funcNode, content) : "";
        if (funcText.endsWith("APIRouter")) {
          const args = right.childForFieldName?.("arguments");
          const kw = collectKeywordArgs(args, content);
          const prefixNode = kw.get("prefix");
          const prefix = prefixNode ? extractPythonString(prefixNode, content) : null;
          if (prefix) {
            prefixes.set(getNodeText(left, content), prefix);
          }
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(root);
  return prefixes;
}

function extractRouteFromDecorator(
  decoratorNode: any,
  functionNode: any,
  content: string,
  framework: string,
  routerPrefixByVar: Map<string, string>,
  handler: string,
  line: number,
): ExtractedRoute | null {
  const callNode = findFirstNodeOfType(decoratorNode, "call");
  if (!callNode) return null;

  const fn = callNode.childForFieldName?.("function");
  const argsNode = callNode.childForFieldName?.("arguments");
  if (!fn || !argsNode) return null;

  // FastAPI: @app.get("/x") / @router.post("/x")
  if (framework === "fastapi" && fn.type === "attribute") {
    const objNode = fn.childForFieldName?.("object");
    const attrNode = fn.childForFieldName?.("attribute");
    if (!objNode || !attrNode) return null;

    const objName = getNodeText(objNode, content);
    const methodName = getNodeText(attrNode, content);
    const mapped = mapToHttpMethod(methodName);
    if (!mapped) return null;

    const pathArg = extractDecoratorPathArg(argsNode, content);
    if (!pathArg) return null;

    const routerPrefix = routerPrefixByVar.get(objName) || "";
    const path = normalizePath(routerPrefix + pathArg);

    const { requestModel, responseModel, queryParams } = extractTypeInfoFromFunction(
      functionNode,
      content,
      mapped,
      path,
    );

    return {
      method: mapped,
      path,
      handler,
      requestModel,
      responseModel,
      queryParams,
      line,
    };
  }

  // Flask: @app.route("/x", methods=["POST"])
  if (framework === "flask" && fn.type === "attribute") {
    const objNode = fn.childForFieldName?.("object");
    const attrNode = fn.childForFieldName?.("attribute");
    if (!objNode || !attrNode) return null;
    const attr = getNodeText(attrNode, content);
    if (attr !== "route") return null;

    const pathArg = extractDecoratorPathArg(argsNode, content);
    if (!pathArg) return null;

    const methods = extractFlaskMethodsArg(argsNode, content);
    const method = (methods[0] || "GET") as HttpMethod;
    const path = normalizePath(pathArg);

    return {
      method,
      path,
      handler,
      line,
    };
  }

  return null;
}

function extractDecoratorPathArg(argsNode: any, content: string): string | null {
  // Prefer keyword path=..., else first positional string.
  const kw = collectKeywordArgs(argsNode, content);
  const pathNode = kw.get("path") || kw.get("url") || null;
  if (pathNode) {
    const s = extractPythonString(pathNode, content);
    if (s) return s;
  }

  for (const node of collectPositionalArgs(argsNode)) {
    const s = extractPythonString(node, content);
    if (s) return s;
  }

  return null;
}

function extractFlaskMethodsArg(argsNode: any, content: string): string[] {
  const kw = collectKeywordArgs(argsNode, content);
  const methodsNode = kw.get("methods");
  if (!methodsNode) return [];

  const listNode = findFirstNodeOfType(methodsNode, "list") || methodsNode;
  const methods: string[] = [];
  for (const child of listNode.children || []) {
    const s = extractPythonString(child, content);
    if (s) methods.push(s.toUpperCase());
  }
  return methods;
}

function extractTypeInfoFromFunction(
  functionNode: any,
  content: string,
  method: HttpMethod,
  path: string,
): { requestModel?: string; responseModel?: string; queryParams?: QueryParam[] } {
  const paramsNode = functionNode.childForFieldName?.("parameters");
  const returnTypeNode = functionNode.childForFieldName?.("return_type");

  const pathParamNames = new Set<string>();
  for (const pm of path.matchAll(/\{(\w+)(?::\w+)?\}/g)) {
    pathParamNames.add(pm[1]);
  }

  const skipNames = new Set([
    "db",
    "session",
    "request",
    "response",
    "user",
    "current_user",
  ]);

  let responseModel: string | undefined;
  if (returnTypeNode) {
    const top = extractTopLevelTypeName(returnTypeNode, content);
    if (top && !isPrimitiveType(top)) responseModel = top;
  }

  const queryParams: QueryParam[] = [];
  let requestModel: string | undefined;

  const params = paramsNode ? collectFunctionParams(paramsNode, content) : [];
  for (const p of params) {
    if (!p.name || skipNames.has(p.name)) continue;
    if (pathParamNames.has(p.name)) continue;
    if (!p.type) continue;

    // primitives become query params
    if (isPrimitiveType(p.type)) {
      queryParams.push({
        name: p.name,
        type: p.type,
        required: p.required,
      });
      continue;
    }

    // request model: first non-primitive param (for write methods)
    if (!requestModel && (method === "POST" || method === "PUT" || method === "PATCH")) {
      requestModel = p.type;
    }
  }

  return {
    requestModel,
    responseModel,
    queryParams: queryParams.length > 0 ? queryParams : undefined,
  };
}

function collectFunctionParams(
  paramsNode: any,
  content: string,
): Array<{ name: string; type?: string; required: boolean }> {
  const out: Array<{ name: string; type?: string; required: boolean }> = [];

  for (const child of paramsNode.children || []) {
    if (!child) continue;

    // typed_parameter / typed_default_parameter
    if (child.type === "typed_parameter" || child.type === "typed_default_parameter") {
      // tree-sitter-python:
      // - typed_parameter: (typed_parameter (identifier) type: (type ...))  (no name field)
      // - typed_default_parameter: (typed_default_parameter name: (identifier) type: ... value: ...)
      const nameNode =
        child.childForFieldName?.("name") ||
        (child.children || []).find((c: any) => c?.type === "identifier");
      const typeNode = child.childForFieldName?.("type");
      const valueNode = child.childForFieldName?.("value");
      const name = nameNode ? getNodeText(nameNode, content) : "";
      const type = typeNode ? normalizeTypeText(getNodeText(typeNode, content)) : undefined;
      const required = !valueNode;
      out.push({ name, type, required });
      continue;
    }

    // default_parameter
    if (child.type === "default_parameter") {
      const nameNode = child.childForFieldName?.("name");
      const name = nameNode ? getNodeText(nameNode, content) : "";
      out.push({ name, required: false });
      continue;
    }

    // identifier
    if (child.type === "identifier") {
      out.push({ name: getNodeText(child, content), required: true });
      continue;
    }
  }

  return out.filter((p) => p.name && p.name !== "self" && p.name !== "cls");
}

// ============================================================================
// Model extraction helpers
// ============================================================================

function getClassBaseClasses(classNode: any, content: string): string[] {
  const bases: string[] = [];
  const args = classNode.childForFieldName?.("superclasses");
  // tree-sitter-python uses `argument_list` as the superclass list
  const argList = args || findFirstNodeOfType(classNode, "argument_list");
  if (!argList) return bases;

  for (const child of argList.children || []) {
    if (!child) continue;
    if (child.type === "identifier" || child.type === "attribute") {
      bases.push(getNodeText(child, content));
    }
  }
  return bases;
}

function isPydanticBaseClass(baseClasses: string[]): boolean {
  return baseClasses.some((b) => b === "BaseModel" || b.endsWith(".BaseModel"));
}

function extractPydanticFieldsFromClass(
  classNode: any,
  content: string,
): ExtractedModelField[] {
  const fields: ExtractedModelField[] = [];

  const bodyNode = classNode.childForFieldName?.("body");
  if (!bodyNode) return fields;

  const visit = (node: any) => {
    if (!node) return;

    // Only consider assignments directly within the class body block.
    if (node.type === "assignment") {
      const left = node.childForFieldName?.("left");
      const typeNode = node.childForFieldName?.("type") || findFirstNodeOfType(node, "type");
      const right = node.childForFieldName?.("right");
      if (left?.type === "identifier" && typeNode) {
        const name = getNodeText(left, content);
        const typeText = normalizeTypeText(getNodeText(typeNode, content));
        const defaultText = right ? getNodeText(right, content).trim() : undefined;

        let required = true;
        if (isOptionalType(typeText)) {
          required = false;
        } else if (defaultText) {
          // Field(...) with ellipsis stays required, otherwise default implies optional
          if (/\bField\s*\(\s*\.\.\.\s*\)/.test(defaultText) || defaultText.includes("...")) {
            required = true;
          } else if (defaultText === "None") {
            required = false;
          } else {
            required = false;
          }
        }

        fields.push({
          name,
          type: typeText,
          required,
          default: defaultText,
        });
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(bodyNode);
  return fields;
}

// ============================================================================
// Generic helpers
// ============================================================================

function findFirstNodeOfType(node: any, type: string): any | null {
  if (!node) return null;
  if (node.type === type) return node;
  for (const child of node.children || []) {
    const found = findFirstNodeOfType(child, type);
    if (found) return found;
  }
  return null;
}

function getDecorators(node: any, content: string): any[] {
  const decorators: any[] = [];
  const parent = node.parent;
  if (parent?.type === "decorated_definition") {
    for (const child of parent.children || []) {
      if (child?.type === "decorator") decorators.push(child);
    }
  }
  return decorators;
}

function collectKeywordArgs(argsNode: any, content: string): Map<string, any> {
  const kw = new Map<string, any>();
  for (const child of argsNode?.children || []) {
    if (child?.type !== "keyword_argument") continue;
    const nameNode = child.childForFieldName?.("name");
    const valueNode = child.childForFieldName?.("value");
    if (nameNode && valueNode) {
      const k = getNodeText(nameNode, content);
      kw.set(k, valueNode);
    }
  }
  return kw;
}

function collectPositionalArgs(argsNode: any): any[] {
  const out: any[] = [];
  for (const child of argsNode?.children || []) {
    if (!child) continue;
    if (child.type === "," || child.type === "(" || child.type === ")") continue;
    if (child.type === "keyword_argument") continue;
    out.push(child);
  }
  return out;
}

export function getNodeText(node: any, content: string): string {
  if (!node) return "";
  return content.slice(node.startIndex, node.endIndex);
}

function extractPythonString(node: any, content: string): string | null {
  if (!node) return null;
  // Accept plain string literals only (skip f-strings for now)
  if (node.type !== "string") return null;
  const raw = getNodeText(node, content).trim();
  const m = raw.match(/^[rubfRUBF]*(['\"]{1,3})([\s\S]*)\1$/);
  if (!m) return null;
  return m[2];
}

function mapToHttpMethod(name: string): HttpMethod | null {
  const n = name.toLowerCase();
  if (n === "get") return "GET";
  if (n === "post") return "POST";
  if (n === "put") return "PUT";
  if (n === "patch") return "PATCH";
  if (n === "delete") return "DELETE";
  return null;
}

function normalizePath(p: string): string {
  // Ensure leading slash and collapse duplicate slashes.
  let out = p || "";
  if (!out.startsWith("/")) out = "/" + out;
  out = out.replace(/\/+?/g, "/");
  // remove trailing slash (except root)
  out = out.length > 1 ? out.replace(/\/$/, "") : out;
  return out;
}

function normalizeTypeText(text: string): string {
  // Strip leading ':' (type nodes sometimes include it depending on slice)
  let t = text.trim();
  t = t.replace(/^:\s*/, "");
  t = t.replace(/^typing\./, "");
  return t;
}

function extractTopLevelTypeName(typeNode: any, content: string): string | null {
  const visit = (n: any): string | null => {
    if (!n) return null;
    if (n.type === "identifier") return getNodeText(n, content);
    if (n.type === "attribute") return getNodeText(n, content);
    for (const child of n.children || []) {
      const r = visit(child);
      if (r) return r;
    }
    return null;
  };
  return visit(typeNode);
}

function isOptionalType(typeText: string): boolean {
  return /\bOptional\b/.test(typeText) || /\bNone\b/.test(typeText) || typeText.includes("|");
}

function isPrimitiveType(typeName: string): boolean {
  const t = typeName.toLowerCase();
  return (
    t === "str" ||
    t === "int" ||
    t === "float" ||
    t === "bool" ||
    t === "uuid" ||
    t === "datetime" ||
    t === "date" ||
    t === "dict" ||
    t === "list" ||
    t === "tuple" ||
    t === "set"
  );
}
