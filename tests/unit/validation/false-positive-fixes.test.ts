/**
 * Tests for False Positive Fixes
 *
 * Validates that the fixes for common false positives work correctly:
 * 1. 'this' references in class methods
 * 2. Fluent API method chaining (Zod, React Query, etc.)
 * 3. Rest parameters in function signatures
 *
 * @format
 */

import { describe, it, expect } from "@jest/globals";
import {
  extractSymbolsAST,
  extractUsagesAST,
  extractImportsAST,
} from "../../../src/tools/validation/extractors/index.js";
import { validateSymbols } from "../../../src/tools/validation/validation.js";

describe("False Positive Fixes", () => {
  describe("this references in class methods", () => {
    it("should not flag 'this' as undefined in class methods", () => {
      const code = `
class NatsClient {
  connect(url: string) {
    this.buildWebSocketUrl(url);
    this.startPing();
  }
  
  buildWebSocketUrl(url: string) {
    return url;
  }
  
  startPing() {
    console.log('ping');
  }
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);
      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      // Should NOT flag 'this' as undefined
      const thisErrors = issues.filter(
        (i) => i.type === "undefinedVariable" && i.message.includes("'this'"),
      );
      expect(thisErrors).toHaveLength(0);
    });

    it("should not flag 'this.websocket' property access", () => {
      const code = `
class WebSocketManager {
  private websocket: WebSocket | null = null;
  
  close() {
    if (this.websocket) {
      this.websocket.close();
    }
  }
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);
      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      const thisErrors = issues.filter(
        (i) =>
          i.message.includes("'this.websocket'") ||
          i.message.includes("'this'"),
      );
      expect(thisErrors).toHaveLength(0);
    });
  });

  describe("fluent API method chaining", () => {
    it("should not flag Zod method chaining as hallucinations", () => {
      const code = `
import { z } from 'zod';

const emailSchema = z.string().email('Invalid email');
const passwordSchema = z
  .string()
  .min(8, 'Too short')
  .regex(/[A-Z]/, 'Need uppercase');
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      // Should not flag string(), email(), min(), regex() as hallucinations
      const methodErrors = issues.filter(
        (i) =>
          i.type === "nonExistentMethod" &&
          (i.message.includes("'string'") ||
            i.message.includes("'email'") ||
            i.message.includes("'min'") ||
            i.message.includes("'regex'")),
      );
      expect(methodErrors).toHaveLength(0);
    });

    it("should not flag React Query methods as hallucinations", () => {
      const code = `
import { useQueryClient } from '@tanstack/react-query';

function MyComponent() {
  const queryClient = useQueryClient();
  
  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.setQueryData(['user', 1], { name: 'John' });
  };
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      // Should not flag invalidateQueries, setQueryData
      const queryErrors = issues.filter(
        (i) =>
          i.type === "nonExistentMethod" &&
          (i.message.includes("'invalidateQueries'") ||
            i.message.includes("'setQueryData'")),
      );
      expect(queryErrors).toHaveLength(0);
    });
  });

  describe("rest parameters", () => {
    it("should not flag rest parameters as undefined variables", () => {
      const code = `
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      // Should NOT flag 'inputs' as undefined
      const inputsError = issues.filter(
        (i) => i.type === "undefinedVariable" && i.message.includes("'inputs'"),
      );
      expect(inputsError).toHaveLength(0);
    });

    it("should not flag destructured rest parameters", () => {
      const code = `
function processItems(first: string, ...rest: string[]) {
  return [first, ...rest.map(x => x.toUpperCase())];
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);
      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      const restError = issues.filter(
        (i) => i.type === "undefinedVariable" && i.message.includes("'rest'"),
      );
      expect(restError).toHaveLength(0);
    });
  });

  describe("named function expressions", () => {
    it("should not flag named function expression as undefined variable", () => {
      const code = `
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function ProtectedComponent(props: P) {
    const { isAuthenticated } = useAuthContext();
    
    if (!isAuthenticated) {
      window.location.href = '/login';
      return null;
    }
    
    return <Component {...props} />;
  };
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      // Named function expression should be extracted as a symbol
      const protectedComponentSymbol = symbols.find(
        (s) => s.name === "ProtectedComponent" && s.type === "function"
      );
      expect(protectedComponentSymbol).toBeDefined();

      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      // Should NOT flag ProtectedComponent as undefined variable
      const protectedComponentError = issues.filter(
        (i) =>
          i.type === "undefinedVariable" &&
          i.message.includes("'ProtectedComponent'"),
      );
      expect(protectedComponentError).toHaveLength(0);
    });

    it("should allow recursion in named function expressions", () => {
      const code = `
function createCounter() {
  let count = 0;
  return function counter() {
    count++;
    if (count < 10) {
      return counter(); // Recursive call
    }
    return count;
  };
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      // counter should be extracted as a symbol
      const counterSymbol = symbols.find(
        (s) => s.name === "counter" && s.type === "function"
      );
      expect(counterSymbol).toBeDefined();

      // counter() call should be tracked as a usage
      const counterUsage = usages.find(
        (u) => u.name === "counter" && u.type === "call"
      );
      expect(counterUsage).toBeDefined();
    });
  });

  describe("common library patterns", () => {
    it("should not flag AbortController.abort() as hallucination", () => {
      const code = `
async function fetchWithTimeout(url: string, timeout: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);
      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      // Should not flag abort() method
      const abortError = issues.filter(
        (i) => i.type === "nonExistentMethod" && i.message.includes("'abort'"),
      );
      expect(abortError).toHaveLength(0);
    });

    it("should not flag toast notification methods", () => {
      const code = `
import { toast } from 'sonner';

function showNotification() {
  toast.success('Success!');
  toast.error('Error!');
  toast.info('Info!');
}
      `;

      const symbols = extractSymbolsAST(code, "typescript");
      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      const issues = validateSymbols(
        usages,
        symbols,
        code,
        "typescript",
        false,
        imports,
        new Map(),
        null,
        "test.ts",
        new Set(),
        [],
      );

      // Should not flag success, error, info methods
      const toastErrors = issues.filter(
        (i) =>
          i.type === "nonExistentMethod" &&
          (i.message.includes("'success'") ||
            i.message.includes("'error'") ||
            i.message.includes("'info'")),
      );
      expect(toastErrors).toHaveLength(0);
    });
  });
});
