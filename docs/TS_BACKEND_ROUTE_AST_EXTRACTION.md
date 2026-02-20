# TS Backend Route AST Extraction — Step 2 Implementation Guide

> **Context:** Step 1 (comment stripping before regex) has already been implemented in
> `src/api-contract/extractors/typescript.ts`. This document guides the Step 2 upgrade:
> making the TypeScript backend route extractor **AST-first**, consistent with how the
> Python extractor works post-fix. The goal is zero regressions — the regex path stays
> intact as a fallback.

---

## 1. Why This Work Exists

### Current architecture (post Step 1)

```
extractRoutesFromTypeScript()
  └── for each file in routes/ | routers/ | controllers/
        └── extractRoutesFromFileRegex(content, filePath)
              └── stripTSComments(content)   ← Step 1 guard
              └── regex scan for router.get(...) / app.post(...)
```

**Problems that remain after Step 1:**

| Problem | Detail |
|---------|--------|
| No handler extraction | `handler` field is always `""` — downstream handler validation is skipped |
| Comment stripping is imperfect | String literals that look like comments (e.g. inside `console.log("// router.get(...)")`) are still stripped incorrectly |
| Regex misses dynamic routes | `router[method](path, handler)` patterns are invisible to the regex |
| No NestJS decorator support | `@Get('/path')`, `@Post('/path')` on controller methods are not detected |
| AST-based accuracy | The frontend service extractor already uses AST; the backend should too |

### Target architecture (post Step 2)

```
extractRoutesFromTypeScript()
  └── for each file in routes/ | routers/ | controllers/
        └── extractRoutesFromFileAST(content, filePath)   ← NEW primary path
              └── tree-sitter parse → walk call_expression nodes
              └── returns RouteDefinition[] (including handler name)
        └── on AST throw → extractRoutesFromFileRegex(content, filePath)  ← fallback unchanged
```

This is **exactly** the same strategy used by the Python extractor:
- Trust the AST result unconditionally (even an empty array means no routes)
- Only fall back to regex if the parser throws
- Regex retains the `stripTSComments` guard from Step 1

---

## 2. What Already Exists (Don't Re-implement)

All of these are ready to use — **do not rewrite them**:

| Utility | Location | What it does |
|---------|----------|--------------|
| `getParser("typescript")` | `src/utils/parser.ts` | Returns a cached tree-sitter TypeScript parser |
| `getNodeText(node, content)` | `src/api-contract/extractors/tsAstUtils.ts` | Extracts raw text from any AST node |
| `mapToHttpMethod(name)` | `src/api-contract/extractors/tsAstUtils.ts` | `"get"` → `"GET"` etc., returns `null` for non-HTTP names |
| `extractEndpointFromArguments(argsNode, content)` | `src/api-contract/extractors/tsAstUtils.ts` | Pulls the first string/template-string argument as an endpoint + query params |
| `findEnclosingFunctionName(node, content)` | `src/api-contract/extractors/tsAstUtils.ts` | Walks up the AST to find the nearest named function/method/arrow |
| `stripTSComments(content)` | `src/api-contract/extractors/typescript.ts` | Step 1 guard — keep in the regex fallback path |
| `RouteDefinition` type | `src/api-contract/types.ts` | The shape `extractRoutesFromTypeScript` must return |

---

## 3. AST Node Shapes to Handle

Tree-sitter represents `router.get('/path', handler)` as:

```
call_expression
  function: member_expression
    object:   identifier         → "router" | "app"
    property: property_identifier → "get" | "post" | ...
  arguments: arguments
    string / template_string     → "/path"
    identifier / arrow_function  → handler
```

And `Router()` is just assigned to a variable first — the call shape is identical.

**NestJS decorators** (out of scope for this iteration, but noted for later):

```
decorator
  call_expression
    function: identifier → "Get" | "Post" | ...
    arguments: arguments
      string → "/path"
```

---

## 4. New Function to Add

Add the following function **directly above** `extractRoutesFromFileRegex` in
`src/api-contract/extractors/typescript.ts`. Do not touch anything below it.

```typescript
/**
 * Extract Express/NestJS routes from a single file using the tree-sitter AST.
 *
 * Handles:
 *   router.get('/path', handler)
 *   app.post('/path', async (req, res) => { ... })
 *   Router().put('/path', handler)
 *
 * Returns an empty array when the file has no matching route definitions —
 * this is intentional and must NOT be treated as a parse failure by the caller.
 *
 * Throws only when tree-sitter itself cannot parse the file, allowing the
 * caller to fall back to the regex path.
 */
function extractRoutesFromFileAST(
  content: string,
  filePath: string,
): RouteDefinition[] {
  const parser = getParser("typescript");
  const tree = parser.parse(content);
  if (!tree) throw new Error("tree-sitter returned null tree");

  const routes: RouteDefinition[] = [];

  const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

  function visit(node: any): void {
    if (node.type === "call_expression") {
      const fnNode = node.childForFieldName("function");
      const argsNode = node.childForFieldName("arguments");

      if (fnNode?.type === "member_expression" && argsNode) {
        const objectNode = fnNode.childForFieldName("object");
        const propertyNode = fnNode.childForFieldName("property");

        if (objectNode && propertyNode) {
          const objectName = getNodeText(objectNode, content);
          const methodName = getNodeText(propertyNode, content).toLowerCase();

          // Only handle router.* / app.* calls with a known HTTP verb
          const isRouterLike =
            objectName === "router" ||
            objectName === "app" ||
            objectName.toLowerCase().endsWith("router");

          if (isRouterLike && HTTP_METHODS.has(methodName)) {
            const httpMethod = mapToHttpMethod(methodName);
            if (!httpMethod) return;

            const extracted = extractEndpointFromArguments(argsNode, content);
            if (!extracted) return;

            // Try to get the handler name from the second/last argument
            const argChildren = argsNode.children.filter(
              (c: any) => c.type !== "," && c.type !== "(" && c.type !== ")",
            );
            // argChildren[0] is the path string; argChildren[1..] are middleware/handler
            const lastArg = argChildren[argChildren.length - 1];
            let handler = "";
            if (lastArg?.type === "identifier") {
              handler = getNodeText(lastArg, content);
            } else if (
              lastArg?.type === "arrow_function" ||
              lastArg?.type === "function"
            ) {
              // Inline handler — use the enclosing named function if available
              handler =
                findEnclosingFunctionName(node, content) ?? "(inline)";
            }

            routes.push({
              method: httpMethod,
              path: extracted.endpoint,
              handler,
              file: filePath,
              line: node.startPosition.row + 1,
            });
          }
        }
      }
    }

    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  visit(tree.rootNode);
  return routes;
}
```

---

## 5. How to Wire It Into the Caller

In `extractRoutesFromTypeScript`, change the inner per-file block from:

```typescript
// BEFORE (Step 1 state)
const content = await fs.readFile(file, "utf-8");
const fileRoutes = extractRoutesFromFileRegex(content, file);
routes.push(...fileRoutes);
```

to:

```typescript
// AFTER (Step 2)
const content = await fs.readFile(file, "utf-8");
let fileRoutes: RouteDefinition[];
try {
  fileRoutes = extractRoutesFromFileAST(content, file);
  // Trust AST result unconditionally — even an empty array means no routes.
} catch {
  // AST parser threw (e.g. severely malformed file) — fall back to regex.
  logger.debug(`AST route extraction failed for ${file}, falling back to regex`);
  fileRoutes = extractRoutesFromFileRegex(content, file);
}
routes.push(...fileRoutes);
```

**That's the only caller change required.** `extractRoutesFromFileRegex` is not removed —
it remains unchanged as the fallback with the `stripTSComments` guard from Step 1.

---

## 6. Imports Needed

`extractRoutesFromFileAST` uses these — verify all are already imported at the top of
`typescript.ts` before adding the function:

```typescript
import { getParser } from "../../utils/parser.js";
import {
  getNodeText,
  mapToHttpMethod,
  extractEndpointFromArguments,
  findEnclosingFunctionName,
} from "./tsAstUtils.js";
```

If any are missing, add them to the existing import block. Do not duplicate imports.

---

## 7. Tests to Write

Create a new test file: `tests/unit/api-contract/ts-backend-route-ast.test.ts`

### 7.1 — Basic route extraction

```typescript
it("extracts router.get route via AST", () => {
  const content = `
    import { Router } from 'express';
    const router = Router();
    router.get('/users', getUsers);
  `;
  const routes = extractRoutesFromFileAST(content, "routes/users.ts");
  expect(routes).toHaveLength(1);
  expect(routes[0]).toMatchObject({ method: "GET", path: "/users", handler: "getUsers" });
});
```

### 7.2 — Commented-out routes must NOT appear

```typescript
it("does not extract commented-out routes", () => {
  const content = `
    // router.get('/old-route', oldHandler)
    /* app.post('/removed', handler) */
    router.get('/current', currentHandler);
  `;
  const routes = extractRoutesFromFileAST(content, "routes/test.ts");
  expect(routes).toHaveLength(1);
  expect(routes[0].path).toBe("/current");
});
```

### 7.3 — Empty file returns empty array, no throw

```typescript
it("returns empty array for file with no routes", () => {
  const content = `export const helper = () => {};`;
  const routes = extractRoutesFromFileAST(content, "utils/helper.ts");
  expect(routes).toHaveLength(0);
});
```

### 7.4 — Multiple HTTP methods

```typescript
it("extracts multiple methods from the same file", () => {
  const content = `
    router.get('/items', list);
    router.post('/items', create);
    router.put('/items/:id', update);
    router.delete('/items/:id', remove);
  `;
  const routes = extractRoutesFromFileAST(content, "routes/items.ts");
  expect(routes.map(r => r.method)).toEqual(["GET", "POST", "PUT", "DELETE"]);
});
```

### 7.5 — Inline arrow function handler

```typescript
it("marks inline handler as (inline)", () => {
  const content = `
    router.get('/ping', async (req, res) => { res.json({ ok: true }); });
  `;
  const routes = extractRoutesFromFileAST(content, "routes/ping.ts");
  expect(routes[0].handler).toBe("(inline)");
});
```

### 7.6 — Fallback regression: regex path still works when AST throws

This test should mock `getParser` to throw and confirm `extractRoutesFromTypeScript`
still returns routes via the regex fallback.

### 7.7 — Existing tests must continue to pass

Run the full suite before and after:

```bash
pnpm vitest run
```

All 756 tests must still pass. If any existing test in
`tests/unit/api-contract/python-extractor.test.ts` or
`tests/unit/api-contract/validators.test.ts` fails, stop and investigate before merging.

---

## 8. What NOT to Change

| File | Reason |
|------|--------|
| `src/api-contract/extractors/tsAstUtils.ts` | All needed helpers already exist — read-only |
| `src/api-contract/extractors/typescript.ts` → `extractRoutesFromFileRegex` | Fallback must stay intact, including `stripTSComments` |
| `src/api-contract/extractors/typescript.ts` → `extractServicesFromFile` | Frontend service extraction is already AST-first — do not touch |
| `src/api-contract/validators/index.ts` | No contract changes needed — `RouteDefinition.handler` is already optional (`""` is valid) |
| `src/api-contract/extractors/python.ts` | Unrelated — do not touch |

---

## 9. Acceptance Criteria

- [ ] `extractRoutesFromFileAST` correctly extracts `router.*` and `app.*` call patterns
- [ ] Commented-out routes produce zero false positives (AST is comment-aware by design)
- [ ] `handler` field is populated with the named handler identifier, or `"(inline)"` for arrow functions
- [ ] Malformed/unparseable files fall back to `extractRoutesFromFileRegex` without throwing
- [ ] Empty files return `[]` without falling back to regex
- [ ] All 7 test cases above pass
- [ ] Full test suite (`pnpm vitest run`) shows no regressions
- [ ] TypeScript compilation passes with `npx tsc --noEmit`
