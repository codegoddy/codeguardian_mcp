/**
 * Unit tests for the builtins module
 * Tests built-in symbol sets and helper functions
 *
 * @format
 */

import {
  PYTHON_BUILTINS,
  PYTHON_BUILTIN_TYPES,
  JS_BUILTINS,
  TS_BUILTIN_TYPES,
  isPythonBuiltin,
  isJSBuiltin,
  isPythonBuiltinType,
  isTSBuiltinType,
  getPythonStdLib,
} from "../../../src/tools/validation/builtins.js";

describe("builtins module", () => {
  describe("PYTHON_BUILTINS", () => {
    it("should contain common Python built-in functions", () => {
      expect(PYTHON_BUILTINS.has("print")).toBe(true);
      expect(PYTHON_BUILTINS.has("len")).toBe(true);
      expect(PYTHON_BUILTINS.has("range")).toBe(true);
      expect(PYTHON_BUILTINS.has("isinstance")).toBe(true);
    });

    it("should contain Python built-in constants", () => {
      expect(PYTHON_BUILTINS.has("True")).toBe(true);
      expect(PYTHON_BUILTINS.has("False")).toBe(true);
      expect(PYTHON_BUILTINS.has("None")).toBe(true);
    });

    it("should contain common Python exceptions", () => {
      expect(PYTHON_BUILTINS.has("ValueError")).toBe(true);
      expect(PYTHON_BUILTINS.has("TypeError")).toBe(true);
      expect(PYTHON_BUILTINS.has("KeyError")).toBe(true);
    });

    it("should not contain non-builtin names", () => {
      expect(PYTHON_BUILTINS.has("myCustomFunction")).toBe(false);
      expect(PYTHON_BUILTINS.has("numpy")).toBe(false);
    });
  });

  describe("PYTHON_BUILTIN_TYPES", () => {
    it("should contain basic Python types", () => {
      expect(PYTHON_BUILTIN_TYPES.has("int")).toBe(true);
      expect(PYTHON_BUILTIN_TYPES.has("str")).toBe(true);
      expect(PYTHON_BUILTIN_TYPES.has("list")).toBe(true);
      expect(PYTHON_BUILTIN_TYPES.has("dict")).toBe(true);
    });

    it("should contain typing module types", () => {
      expect(PYTHON_BUILTIN_TYPES.has("Optional")).toBe(true);
      expect(PYTHON_BUILTIN_TYPES.has("Union")).toBe(true);
      expect(PYTHON_BUILTIN_TYPES.has("List")).toBe(true);
      expect(PYTHON_BUILTIN_TYPES.has("Dict")).toBe(true);
    });
  });

  describe("JS_BUILTINS", () => {
    it("should contain common JavaScript globals", () => {
      expect(JS_BUILTINS.has("console")).toBe(true);
      expect(JS_BUILTINS.has("setTimeout")).toBe(true);
      expect(JS_BUILTINS.has("Promise")).toBe(true);
      expect(JS_BUILTINS.has("Array")).toBe(true);
    });

    it("should contain Node.js globals", () => {
      expect(JS_BUILTINS.has("process")).toBe(true);
      expect(JS_BUILTINS.has("Buffer")).toBe(true);
      expect(JS_BUILTINS.has("require")).toBe(true);
    });

    it("should contain browser APIs", () => {
      expect(JS_BUILTINS.has("document")).toBe(true);
      expect(JS_BUILTINS.has("window")).toBe(true);
      expect(JS_BUILTINS.has("fetch")).toBe(true);
    });
  });

  describe("TS_BUILTIN_TYPES", () => {
    it("should contain primitive TypeScript types", () => {
      expect(TS_BUILTIN_TYPES.has("string")).toBe(true);
      expect(TS_BUILTIN_TYPES.has("number")).toBe(true);
      expect(TS_BUILTIN_TYPES.has("boolean")).toBe(true);
      expect(TS_BUILTIN_TYPES.has("void")).toBe(true);
    });

    it("should contain TypeScript utility types", () => {
      expect(TS_BUILTIN_TYPES.has("Partial")).toBe(true);
      expect(TS_BUILTIN_TYPES.has("Required")).toBe(true);
      expect(TS_BUILTIN_TYPES.has("Readonly")).toBe(true);
      expect(TS_BUILTIN_TYPES.has("Pick")).toBe(true);
    });

    it("should contain DOM types", () => {
      expect(TS_BUILTIN_TYPES.has("HTMLElement")).toBe(true);
      expect(TS_BUILTIN_TYPES.has("Document")).toBe(true);
      expect(TS_BUILTIN_TYPES.has("Event")).toBe(true);
    });
  });

  describe("isPythonBuiltin", () => {
    it("should return true for Python built-ins", () => {
      expect(isPythonBuiltin("print")).toBe(true);
      expect(isPythonBuiltin("len")).toBe(true);
      expect(isPythonBuiltin("True")).toBe(true);
    });

    it("should return false for non-builtins", () => {
      expect(isPythonBuiltin("myFunction")).toBe(false);
      expect(isPythonBuiltin("numpy")).toBe(false);
    });
  });

  describe("isJSBuiltin", () => {
    it("should return true for JavaScript built-ins", () => {
      expect(isJSBuiltin("console")).toBe(true);
      expect(isJSBuiltin("Array")).toBe(true);
      expect(isJSBuiltin("Promise")).toBe(true);
    });

    it("should return false for non-builtins", () => {
      expect(isJSBuiltin("myFunction")).toBe(false);
      expect(isJSBuiltin("DefinitelyNotBuiltin")).toBe(false);
    });
  });

  describe("isPythonBuiltinType", () => {
    it("should return true for Python built-in types", () => {
      expect(isPythonBuiltinType("int")).toBe(true);
      expect(isPythonBuiltinType("str")).toBe(true);
      expect(isPythonBuiltinType("Optional")).toBe(true);
    });

    it("should return false for non-builtin types", () => {
      expect(isPythonBuiltinType("MyClass")).toBe(false);
      expect(isPythonBuiltinType("CustomType")).toBe(false);
    });
  });

  describe("isTSBuiltinType", () => {
    it("should return true for TypeScript built-in types", () => {
      expect(isTSBuiltinType("string")).toBe(true);
      expect(isTSBuiltinType("number")).toBe(true);
      expect(isTSBuiltinType("Partial")).toBe(true);
    });

    it("should return false for non-builtin types", () => {
      expect(isTSBuiltinType("MyInterface")).toBe(false);
      expect(isTSBuiltinType("CustomType")).toBe(false);
    });
  });

  describe("getPythonStdLib", () => {
    it("should return a Set of Python standard library modules", () => {
      const stdLib = getPythonStdLib();
      expect(stdLib).toBeInstanceOf(Set);
      expect(stdLib.size).toBeGreaterThan(0);
    });

    it("should contain common standard library modules", () => {
      const stdLib = getPythonStdLib();
      expect(stdLib.has("os")).toBe(true);
      expect(stdLib.has("sys")).toBe(true);
      expect(stdLib.has("json")).toBe(true);
      expect(stdLib.has("re")).toBe(true);
      expect(stdLib.has("datetime")).toBe(true);
      expect(stdLib.has("pathlib")).toBe(true);
    });

    it("should contain typing and collections modules", () => {
      const stdLib = getPythonStdLib();
      expect(stdLib.has("typing")).toBe(true);
      expect(stdLib.has("collections")).toBe(true);
      expect(stdLib.has("itertools")).toBe(true);
    });

    it("should not contain third-party packages", () => {
      const stdLib = getPythonStdLib();
      expect(stdLib.has("numpy")).toBe(false);
      expect(stdLib.has("pandas")).toBe(false);
      expect(stdLib.has("requests")).toBe(false);
    });
  });
});
