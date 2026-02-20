/**
 * Unit tests for extractRoutesFromFileAST
 *
 * Covers all acceptance criteria from the Step 2 implementation guide:
 *   7.1  Basic route extraction
 *   7.2  Commented-out routes must NOT appear
 *   7.3  Empty file returns empty array, no throw
 *   7.4  Multiple HTTP methods
 *   7.5  Inline arrow function handler → "(inline)"
 *   7.6  Fallback regression — AST throw is propagated so caller can use regex
 *
 * @format
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { extractRoutesFromFileAST } from "../../../src/api-contract/extractors/typescript.js";
import * as parserModule from "../../../src/tools/validation/parser.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// 7.1 — Basic route extraction
// ============================================================================

describe("extractRoutesFromFileAST — basic extraction", () => {
  it("extracts a router.get route with a named handler", () => {
    const content = `
      import { Router } from 'express';
      const router = Router();
      router.get('/users', getUsers);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/users.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/users",
      handler: "getUsers",
      file: "routes/users.ts",
    });
    expect(routes[0].line).toBeGreaterThan(0);
  });

  it("extracts an app.post route with a named handler", () => {
    const content = `
      const app = express();
      app.post('/login', loginHandler);
    `;
    const routes = extractRoutesFromFileAST(content, "src/app.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "POST",
      path: "/login",
      handler: "loginHandler",
    });
  });

  it("extracts a route with a path parameter", () => {
    const content = `
      router.get('/users/:id', getUserById);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/users.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/users/:id",
      handler: "getUserById",
    });
  });
});

// ============================================================================
// 7.2 — Commented-out routes must NOT appear
// ============================================================================

describe("extractRoutesFromFileAST — comment filtering", () => {
  it("does not extract single-line commented-out routes", () => {
    const content = `
      // router.get('/old-route', oldHandler)
      router.get('/current', currentHandler);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/test.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/current");
  });

  it("does not extract block-comment routes", () => {
    const content = `
      /* app.post('/removed', handler) */
      router.get('/current', currentHandler);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/test.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/current");
  });

  it("does not extract routes inside multi-line block comments", () => {
    const content = `
      /*
       * Old endpoints — kept for reference only:
       * router.get('/v1/users', oldGetUsers)
       * router.post('/v1/users', oldCreateUser)
       */
      router.get('/v2/users', getUsers);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/users.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/v2/users");
  });

  it("does not extract routes in string literals that resemble comments", () => {
    const content = `
      console.log("// router.get('/fake', fakeHandler)");
      router.get('/real', realHandler);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/test.ts");

    // The AST is comment-aware; the string literal is parsed as a string, not a route.
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/real");
  });
});

// ============================================================================
// 7.3 — Empty / route-free files return [] without throwing
// ============================================================================

describe("extractRoutesFromFileAST — empty / no-route files", () => {
  it("returns an empty array for a file with no routes", () => {
    const content = `export const helper = () => {};`;
    const routes = extractRoutesFromFileAST(content, "utils/helper.ts");

    expect(routes).toHaveLength(0);
  });

  it("returns an empty array for a completely empty file", () => {
    const routes = extractRoutesFromFileAST("", "routes/empty.ts");

    expect(routes).toHaveLength(0);
  });

  it("returns an empty array for a file with only imports", () => {
    const content = `
      import express from 'express';
      import { Router } from 'express';
    `;
    const routes = extractRoutesFromFileAST(content, "routes/stubs.ts");

    expect(routes).toHaveLength(0);
  });
});

// ============================================================================
// 7.4 — Multiple HTTP methods
// ============================================================================

describe("extractRoutesFromFileAST — multiple HTTP methods", () => {
  it("extracts all four CRUD methods from the same file in order", () => {
    const content = `
      router.get('/items', list);
      router.post('/items', create);
      router.put('/items/:id', update);
      router.delete('/items/:id', remove);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/items.ts");

    expect(routes).toHaveLength(4);
    expect(routes.map((r) => r.method)).toEqual(["GET", "POST", "PUT", "DELETE"]);
  });

  it("extracts PATCH as well as the four standard CRUD methods", () => {
    const content = `
      router.get('/items', list);
      router.post('/items', create);
      router.put('/items/:id', replace);
      router.patch('/items/:id', update);
      router.delete('/items/:id', remove);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/items.ts");

    expect(routes).toHaveLength(5);
    expect(routes.map((r) => r.method)).toEqual([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ]);
  });

  it("extracts methods from a mix of router.* and app.* calls", () => {
    const content = `
      app.get('/health', healthCheck);
      router.post('/users', createUser);
    `;
    const routes = extractRoutesFromFileAST(content, "src/server.ts");

    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ method: "GET", path: "/health" });
    expect(routes[1]).toMatchObject({ method: "POST", path: "/users" });
  });
});

// ============================================================================
// 7.5 — Inline arrow function handler → "(inline)"
// ============================================================================

describe("extractRoutesFromFileAST — inline handlers", () => {
  it('marks an inline arrow function handler as "(inline)"', () => {
    const content = `
      router.get('/ping', async (req, res) => { res.json({ ok: true }); });
    `;
    const routes = extractRoutesFromFileAST(content, "routes/ping.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBe("(inline)");
  });

  it('marks an inline regular function handler as "(inline)"', () => {
    const content = `
      router.post('/echo', function(req, res) { res.send(req.body); });
    `;
    const routes = extractRoutesFromFileAST(content, "routes/echo.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBe("(inline)");
  });

  it("extracts the named handler when a named function is passed", () => {
    const content = `
      router.get('/users', getUsers);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/users.ts");

    expect(routes[0].handler).toBe("getUsers");
    expect(routes[0].handler).not.toBe("(inline)");
  });
});

// ============================================================================
// 7.6 — Fallback regression: AST error is surfaced so the caller can fall back
// ============================================================================

describe("extractRoutesFromFileAST — error propagation for fallback", () => {
  it("throws when getParser throws, allowing the caller to fall back to regex", () => {
    vi.spyOn(parserModule, "getParser").mockImplementationOnce(() => {
      throw new Error("parser unavailable");
    });

    const content = `router.get('/test', testHandler);`;
    expect(() =>
      extractRoutesFromFileAST(content, "routes/test.ts"),
    ).toThrow("parser unavailable");
  });

  it("throws when the parser returns a null tree", () => {
    vi.spyOn(parserModule, "getParser").mockReturnValueOnce({
      parse: () => null,
    } as any);

    const content = `router.get('/test', testHandler);`;
    expect(() =>
      extractRoutesFromFileAST(content, "routes/test.ts"),
    ).toThrow("tree-sitter returned null tree");
  });

  it("works correctly after the mock is restored", () => {
    // Confirm the real implementation still functions post-restore
    const content = `router.get('/after-restore', myHandler);`;
    const routes = extractRoutesFromFileAST(content, "routes/test.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ method: "GET", path: "/after-restore" });
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("extractRoutesFromFileAST — edge cases", () => {
  it("handles routes with middleware arguments before the final handler", () => {
    const content = `
      router.get('/protected', authMiddleware, getProtectedResource);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/protected.ts");

    expect(routes).toHaveLength(1);
    // The LAST argument is the handler
    expect(routes[0].handler).toBe("getProtectedResource");
  });

  it("does not extract non-HTTP methods like router.use()", () => {
    const content = `
      router.use('/api', apiRouter);
      router.get('/users', getUsers);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/index.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/users");
  });

  it("correctly reports 1-based line numbers", () => {
    const content = `
const router = Router();

router.get('/line-test', handler);
`;
    const routes = extractRoutesFromFileAST(content, "routes/lines.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0].line).toBe(4);
  });

  it("extracts routes from a variable named apiRouter (ends with 'router')", () => {
    const content = `
      const apiRouter = Router();
      apiRouter.get('/api/health', healthCheck);
    `;
    const routes = extractRoutesFromFileAST(content, "routes/api.ts");

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/api/health",
      handler: "healthCheck",
    });
  });
});
