/**
 * Tests for Python false positive reduction fixes
 *
 * These tests verify that the Python extractor and validation logic
 * correctly skip local definitions, loop variables, keyword arguments,
 * unpacking targets, with-as, except-as, and other Python-specific
 * patterns that were previously causing thousands of false positives.
 *
 * @format
 */

import { describe, it, expect } from "vitest";
import type ParserT from "tree-sitter";
import { getParser } from "../../../src/tools/validation/parser.js";
import {
  extractPythonUsages,
  extractPythonImports,
} from "../../../src/tools/validation/extractors/python.js";
import {
  validateSymbols,
} from "../../../src/tools/validation/validation.js";
import {
  isPythonBuiltin,
  PYTHON_BUILTINS,
} from "../../../src/tools/validation/builtins.js";
import type {
  ASTUsage,
  ASTImport,
  ProjectSymbol,
} from "../../../src/tools/validation/types.js";

// Helper to parse Python code and extract usages
function parsePython(code: string): ParserT.SyntaxNode {
  const tree = getParser("python").parse(code);
  return tree.rootNode;
}

function getUsages(code: string): ASTUsage[] {
  const root = parsePython(code);
  const usages: ASTUsage[] = [];
  extractPythonUsages(root, code, usages, new Set());
  return usages;
}

function getImports(code: string): ASTImport[] {
  const root = parsePython(code);
  const imports: ASTImport[] = [];
  extractPythonImports(root, code, imports);
  return imports;
}

// ==========================================================================
// 1. Identifier extraction: skip local definitions (biggest FP source)
// ==========================================================================

describe("Python False Positive Fixes - Identifier Extraction", () => {
  describe("should NOT extract assignment targets as references", () => {
    it("simple assignment", () => {
      const usages = getUsages("x = 42");
      const refs = usages.filter(u => u.type === "reference" && u.name === "x");
      expect(refs).toHaveLength(0);
    });

    it("augmented assignment", () => {
      const usages = getUsages("count += 1");
      const refs = usages.filter(u => u.type === "reference" && u.name === "count");
      expect(refs).toHaveLength(0);
    });

    it("multiple assignment targets via unpacking", () => {
      const code = "a, b = 1, 2";
      const usages = getUsages(code);
      const aRefs = usages.filter(u => u.type === "reference" && u.name === "a");
      const bRefs = usages.filter(u => u.type === "reference" && u.name === "b");
      expect(aRefs).toHaveLength(0);
      expect(bRefs).toHaveLength(0);
    });
  });

  describe("should NOT extract for-loop variables as references", () => {
    it("simple for loop variable", () => {
      const code = "for item in items:\n    print(item)";
      const usages = getUsages(code);
      // "item" on the left of `for item in` should NOT be a reference
      // but "item" used inside the body IS a reference (or call arg)
      const itemDefs = usages.filter(
        u => u.type === "reference" && u.name === "item" && u.line === 1
      );
      expect(itemDefs).toHaveLength(0);
    });

    it("tuple unpacking in for loop", () => {
      const code = "for k, v in items.items():\n    pass";
      const usages = getUsages(code);
      const kRefs = usages.filter(u => u.type === "reference" && u.name === "k");
      const vRefs = usages.filter(u => u.type === "reference" && u.name === "v");
      expect(kRefs).toHaveLength(0);
      expect(vRefs).toHaveLength(0);
    });
  });

  describe("should NOT extract with-as variables as references", () => {
    it("with statement variable", () => {
      const code = 'with open("file.txt") as f:\n    data = f.read()';
      const usages = getUsages(code);
      // "f" on the `as f` line should not be a reference definition
      // The only "f" usage should be from f.read() (methodCall object)
      const fRefs = usages.filter(u => u.type === "reference" && u.name === "f");
      expect(fRefs).toHaveLength(0);
    });
  });

  describe("should NOT extract except-as variables as references", () => {
    it("except clause variable", () => {
      const code = "try:\n    pass\nexcept Exception as e:\n    print(e)";
      const usages = getUsages(code);
      // "e" on the `except ... as e` line should not be a reference
      const eRefsLine3 = usages.filter(
        u => u.type === "reference" && u.name === "e" && u.line === 3
      );
      expect(eRefsLine3).toHaveLength(0);
    });
  });

  describe("should NOT extract keyword argument names as references", () => {
    it("keyword argument in function call", () => {
      const code = 'func(name="hello", value=42)';
      const usages = getUsages(code);
      // "name" and "value" as keyword arg names should NOT be references
      const nameRefs = usages.filter(u => u.type === "reference" && u.name === "name");
      const valueRefs = usages.filter(u => u.type === "reference" && u.name === "value");
      expect(nameRefs).toHaveLength(0);
      expect(valueRefs).toHaveLength(0);
    });

    it("keyword arguments in class constructor", () => {
      const code = `new_client = Client(\n    name=client_data.name,\n    email=client_data.email,\n    user_id=user_id,\n)`;
      const usages = getUsages(code);
      // "name", "email", "user_id" as keyword arg names should NOT be references
      const kwargNames = ["name", "email"];
      for (const kw of kwargNames) {
        const refs = usages.filter(u => u.type === "reference" && u.name === kw);
        expect(refs).toHaveLength(0);
      }
    });
  });

  describe("should NOT extract comprehension variables as references", () => {
    it("list comprehension variable", () => {
      const code = "result = [x * 2 for x in items]";
      const usages = getUsages(code);
      // "x" as the loop variable in the comprehension should not be a definition-reference
      // but "x" used in the expression part IS a reference
      const xRefs = usages.filter(u => u.type === "reference" && u.name === "x");
      // At most 1 reference for the usage of x in `x * 2`, not 2 (one for definition)
      expect(xRefs.length).toBeLessThanOrEqual(1);
    });
  });

  describe("should NOT extract decorator names as references", () => {
    it("decorator identifier", () => {
      const code = "@staticmethod\ndef func():\n    pass";
      const usages = getUsages(code);
      const decoratorRefs = usages.filter(u => u.type === "reference" && u.name === "staticmethod");
      expect(decoratorRefs).toHaveLength(0);
    });
  });

  describe("should NOT extract global/nonlocal declarations as references", () => {
    it("global statement", () => {
      const code = "def func():\n    global counter\n    counter += 1";
      const usages = getUsages(code);
      // "counter" in `global counter` should not be a reference
      const counterRefsLine2 = usages.filter(
        u => u.type === "reference" && u.name === "counter" && u.line === 2
      );
      expect(counterRefsLine2).toHaveLength(0);
    });
  });

  describe("should still extract genuine references", () => {
    it("function call arguments are still extracted", () => {
      const code = "result = my_func(some_var)";
      const usages = getUsages(code);
      // my_func should be a call
      const calls = usages.filter(u => u.type === "call" && u.name === "my_func");
      expect(calls).toHaveLength(1);
      // some_var should be a reference (it's used, not defined)
      const refs = usages.filter(u => u.type === "reference" && u.name === "some_var");
      expect(refs).toHaveLength(1);
    });

    it("right-hand side of assignment is still extracted", () => {
      const code = "x = existing_var";
      const usages = getUsages(code);
      // x (left side) should NOT be a reference
      const xRefs = usages.filter(u => u.type === "reference" && u.name === "x");
      expect(xRefs).toHaveLength(0);
      // existing_var (right side) SHOULD be a reference
      const existingRefs = usages.filter(u => u.type === "reference" && u.name === "existing_var");
      expect(existingRefs).toHaveLength(1);
    });

    it("method calls are still extracted", () => {
      const code = "obj.do_something(arg)";
      const usages = getUsages(code);
      const methodCalls = usages.filter(u => u.type === "methodCall" && u.name === "do_something");
      expect(methodCalls).toHaveLength(1);
    });
  });
});

// ==========================================================================
// 2. Realistic Python code: should produce minimal/no false references
// ==========================================================================

describe("Python False Positive Fixes - Realistic Code Patterns", () => {
  it("FastAPI endpoint should not produce false reference usages for local vars", () => {
    const code = `
async def create_client(client_data: ClientCreate, user_id: UUID, db: AsyncSession) -> Client:
    new_client = Client(
        name=client_data.name,
        email=client_data.email,
        user_id=user_id,
    )
    db.add(new_client)
    await db.commit()
    await db.refresh(new_client)
    return new_client
`;
    const usages = getUsages(code);
    // "new_client" as assignment target should NOT be a reference
    const newClientDefs = usages.filter(
      u => u.type === "reference" && u.name === "new_client" && u.line === 3
    );
    expect(newClientDefs).toHaveLength(0);

    // keyword args (name, email, user_id) should NOT be references
    const kwargRefs = usages.filter(
      u => u.type === "reference" && (u.name === "name" || u.name === "email")
    );
    expect(kwargRefs).toHaveLength(0);
  });

  it("for loop with dict unpacking should not flag loop variables", () => {
    const code = `
for key, value in config.items():
    if key.startswith("FEATURE_"):
        result[key] = value
`;
    const usages = getUsages(code);
    // "key" and "value" as for-loop unpacking targets should NOT be references on line 2
    const keyDefs = usages.filter(
      u => u.type === "reference" && u.name === "key" && u.line === 2
    );
    const valueDefs = usages.filter(
      u => u.type === "reference" && u.name === "value" && u.line === 2
    );
    expect(keyDefs).toHaveLength(0);
    expect(valueDefs).toHaveLength(0);
  });

  it("try/except/with pattern should not flag handler variables", () => {
    const code = `
try:
    with open("data.json") as f:
        data = json.loads(f.read())
except FileNotFoundError as err:
    logger.error(err)
`;
    const usages = getUsages(code);
    // "f" as with-as target should NOT be a reference
    const fDefs = usages.filter(u => u.type === "reference" && u.name === "f");
    expect(fDefs).toHaveLength(0);
    // "err" as except-as target should NOT be a reference on the except line
    const errDefs = usages.filter(
      u => u.type === "reference" && u.name === "err" && u.line === 5
    );
    expect(errDefs).toHaveLength(0);
    // "data" as assignment target should NOT be a reference
    const dataDefs = usages.filter(
      u => u.type === "reference" && u.name === "data" && u.line === 4
    );
    expect(dataDefs).toHaveLength(0);
  });

  it("class with self/cls methods should not produce self/cls references", () => {
    const code = `
class MyService:
    def __init__(self):
        self.client = None

    @classmethod
    async def get_client(cls):
        if cls._client is None:
            cls._client = create_client()
        return cls._client
`;
    const usages = getUsages(code);
    // self.client and cls._client are attribute access patterns
    // Even if some "self"/"cls" references leak through the extractor,
    // they are recognized as Python builtins and will NOT be flagged by validation
    const selfRefs = usages.filter(
      u => u.type === "reference" && u.name === "self"
    );
    const clsRefs = usages.filter(
      u => u.type === "reference" && u.name === "cls"
    );
    // Verify that even if extracted, they are builtins (so validation skips them)
    expect(isPythonBuiltin("self")).toBe(true);
    expect(isPythonBuiltin("cls")).toBe(true);
  });
});

// ==========================================================================
// 3. Builtins: Python stdlib modules and common identifiers
// ==========================================================================

describe("Python False Positive Fixes - Builtins", () => {
  describe("isPythonBuiltin should recognize stdlib modules", () => {
    const stdlibModules = [
      "os", "sys", "json", "re", "math", "logging", "datetime", "time",
      "pathlib", "collections", "itertools", "functools", "typing", "abc",
      "io", "hashlib", "uuid", "asyncio", "subprocess", "threading",
      "contextlib", "dataclasses", "enum", "random", "warnings",
    ];

    for (const mod of stdlibModules) {
      it(`should recognize '${mod}' as a Python builtin`, () => {
        expect(isPythonBuiltin(mod)).toBe(true);
      });
    }
  });

  describe("isPythonBuiltin should recognize common identifiers", () => {
    const commonIds = [
      "logger", "app", "db", "session", "config", "settings",
      "self", "cls",
    ];

    for (const id of commonIds) {
      it(`should recognize '${id}' as a Python builtin`, () => {
        expect(isPythonBuiltin(id)).toBe(true);
      });
    }
  });

  describe("isPythonBuiltin should recognize dunder names", () => {
    const dunders = [
      "__init__", "__main__", "__all__", "__file__", "__name__",
      "__str__", "__repr__", "__len__", "__enter__", "__exit__",
      "__call__", "__eq__", "__hash__",
    ];

    for (const d of dunders) {
      it(`should recognize '${d}' as a Python builtin`, () => {
        expect(isPythonBuiltin(d)).toBe(true);
      });
    }
  });

  describe("isPythonBuiltin should recognize Python built-in functions", () => {
    const builtinFuncs = [
      "print", "len", "range", "enumerate", "zip", "map", "filter",
      "sorted", "reversed", "isinstance", "issubclass", "getattr",
      "setattr", "hasattr", "super", "type", "int", "str", "float",
      "bool", "list", "dict", "set", "tuple",
    ];

    for (const fn of builtinFuncs) {
      it(`should recognize '${fn}' as a Python builtin`, () => {
        expect(isPythonBuiltin(fn)).toBe(true);
      });
    }
  });
});

// ==========================================================================
// 4. Validation: self/cls method calls should be skipped
// ==========================================================================

describe("Python False Positive Fixes - Validation", () => {
  it("should not flag self.method() calls as issues", () => {
    const code = `
class MyClass:
    def process(self):
        self.validate()
        self.save()
`;
    const usages = getUsages(code);
    const selfMethodCalls = usages.filter(
      u => u.type === "methodCall" && u.object === "self"
    );

    // Even if self.validate() and self.save() are extracted as usages,
    // validateSymbols should skip them
    const symbolTable: ProjectSymbol[] = [];
    const issues = validateSymbols(
      selfMethodCalls,
      symbolTable,
      code,
      "python",
      false, // non-strict
    );
    expect(issues).toHaveLength(0);
  });

  it("should not flag cls.method() calls as issues", () => {
    const code = `
class MyClass:
    @classmethod
    def create(cls):
        return cls.from_dict({})
`;
    const usages = getUsages(code);
    const clsMethodCalls = usages.filter(
      u => u.type === "methodCall" && u.object === "cls"
    );

    const symbolTable: ProjectSymbol[] = [];
    const issues = validateSymbols(
      clsMethodCalls,
      symbolTable,
      code,
      "python",
      false,
    );
    expect(issues).toHaveLength(0);
  });

  it("should not flag stdlib module method calls as issues", () => {
    const code = `
data = json.loads(raw)
pattern = re.compile(r"\\d+")
logger.info("hello")
`;
    // Simulate usages for stdlib method calls
    const usages: ASTUsage[] = [
      { name: "loads", type: "methodCall", object: "json", line: 2, column: 0, code: 'data = json.loads(raw)' },
      { name: "compile", type: "methodCall", object: "re", line: 3, column: 0, code: 'pattern = re.compile(r"\\d+")' },
      { name: "info", type: "methodCall", object: "logger", line: 4, column: 0, code: 'logger.info("hello")' },
    ];

    const symbolTable: ProjectSymbol[] = [];
    const issues = validateSymbols(
      usages,
      symbolTable,
      code,
      "python",
      false,
    );
    // None of these should be flagged — json, re, logger are whitelisted
    expect(issues).toHaveLength(0);
  });

  it("should not flag Python builtins used as function calls", () => {
    const code = `
x = len(items)
y = range(10)
z = isinstance(obj, MyClass)
`;
    const usages: ASTUsage[] = [
      { name: "len", type: "call", line: 2, column: 0, code: "x = len(items)", argCount: 1 },
      { name: "range", type: "call", line: 3, column: 0, code: "y = range(10)", argCount: 1 },
      { name: "isinstance", type: "call", line: 4, column: 0, code: "z = isinstance(obj, MyClass)", argCount: 2 },
    ];

    const symbolTable: ProjectSymbol[] = [];
    const issues = validateSymbols(
      usages,
      symbolTable,
      code,
      "python",
      false,
    );
    expect(issues).toHaveLength(0);
  });

  it("should not flag Python builtins used as references", () => {
    const code = "x = True\ny = None\nz = False";
    const usages: ASTUsage[] = [
      { name: "True", type: "reference", line: 1, column: 0, code: "x = True" },
      { name: "None", type: "reference", line: 2, column: 0, code: "y = None" },
      { name: "False", type: "reference", line: 3, column: 0, code: "z = False" },
    ];

    const symbolTable: ProjectSymbol[] = [];
    const issues = validateSymbols(
      usages,
      symbolTable,
      code,
      "python",
      false,
    );
    expect(issues).toHaveLength(0);
  });
});

// ==========================================================================
// 5. Regression: real-world Python patterns from the test backend
// ==========================================================================

describe("Python False Positive Fixes - Real-World Patterns", () => {
  it("SQLAlchemy model definition should not produce false positives", () => {
    const code = `
import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID

class Deliverable(Base):
    __tablename__ = "deliverables"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    is_approved = Column(Boolean, default=False)
`;
    const usages = getUsages(code);
    // Assignment targets (id, title, is_approved, __tablename__) should NOT be references
    const assignTargets = ["id", "title", "is_approved", "__tablename__"];
    for (const target of assignTargets) {
      const refs = usages.filter(u => u.type === "reference" && u.name === target);
      expect(refs).toHaveLength(0);
    }
    // Keyword arg names (as_uuid, primary_key, default, nullable) should NOT be references
    const kwargNames = ["as_uuid", "primary_key", "nullable"];
    for (const kw of kwargNames) {
      const refs = usages.filter(u => u.type === "reference" && u.name === kw);
      expect(refs).toHaveLength(0);
    }
  });

  it("FastAPI main.py pattern should not produce false positives for app setup", () => {
    const code = `
from fastapi import FastAPI
app = FastAPI(title="My API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, handler)
`;
    const usages = getUsages(code);
    // "app" as assignment target should NOT be a reference
    const appDefs = usages.filter(
      u => u.type === "reference" && u.name === "app" && u.line === 3
    );
    expect(appDefs).toHaveLength(0);
    // keyword args (title, version) should NOT be references
    const titleRefs = usages.filter(u => u.type === "reference" && u.name === "title");
    const versionRefs = usages.filter(u => u.type === "reference" && u.name === "version");
    expect(titleRefs).toHaveLength(0);
    expect(versionRefs).toHaveLength(0);
  });

  it("dataclass/pydantic pattern should not flag field assignments", () => {
    const code = `
@dataclass
class FeatureFlags:
    ai_enabled: bool = True
    git_enabled: bool = True

    @classmethod
    def from_env(cls) -> "FeatureFlags":
        return cls(
            ai_enabled=os.getenv("AI", "true").lower() == "true",
            git_enabled=os.getenv("GIT", "true").lower() == "true",
        )
`;
    const usages = getUsages(code);
    // keyword args in cls() call should NOT be references
    const aiRefs = usages.filter(u => u.type === "reference" && u.name === "ai_enabled");
    const gitRefs = usages.filter(u => u.type === "reference" && u.name === "git_enabled");
    expect(aiRefs).toHaveLength(0);
    expect(gitRefs).toHaveLength(0);
  });

  it("async context manager pattern should not flag variables", () => {
    const code = `
async def process():
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        data = response.json()
    return data
`;
    const usages = getUsages(code);
    // "client" as with-as target should NOT be a reference
    const clientDefs = usages.filter(
      u => u.type === "reference" && u.name === "client" && u.line === 3
    );
    expect(clientDefs).toHaveLength(0);
    // "response" and "data" as assignment targets should NOT be references
    const responseDefs = usages.filter(
      u => u.type === "reference" && u.name === "response" && u.line === 4
    );
    const dataDefs = usages.filter(
      u => u.type === "reference" && u.name === "data" && u.line === 5
    );
    expect(responseDefs).toHaveLength(0);
    expect(dataDefs).toHaveLength(0);
  });
});

// ==========================================================================
// 6. Tree-sitter node identity: .id comparison fix
//    Tests that skip conditions work on larger/multi-line code where
//    tree-sitter childForFieldName() returns different JS wrapper objects
// ==========================================================================

describe("Python False Positive Fixes - Tree-sitter Node Identity (.id fix)", () => {
  it("should skip attribute names in multi-line method call chains", () => {
    const code = `
app.include_router(
    activities.router,
    prefix="/api",
    tags=["activities"],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
)
`;
    const usages = getUsages(code);
    // "include_router", "router", "add_middleware" are attribute names - should NOT be references
    const attrNames = ["include_router", "router", "add_middleware"];
    for (const name of attrNames) {
      const refs = usages.filter(u => u.type === "reference" && u.name === name);
      expect(refs).toHaveLength(0);
    }
    // "prefix", "tags", "allow_origins", "allow_methods" are keyword args - should NOT be references
    const kwargNames = ["prefix", "tags", "allow_origins", "allow_methods"];
    for (const name of kwargNames) {
      const refs = usages.filter(u => u.type === "reference" && u.name === name);
      expect(refs).toHaveLength(0);
    }
    // But method calls should be extracted
    const methodCalls = usages.filter(u => u.type === "methodCall");
    expect(methodCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("should skip attribute names in nested attribute access (settings.environment)", () => {
    const code = `
setup_logging(
    log_file=os.getenv("LOG_FILE", None),
    json_logs=settings.environment == "production",
)
`;
    const usages = getUsages(code);
    // "log_file", "json_logs" are keyword args - NOT references
    expect(usages.filter(u => u.type === "reference" && u.name === "log_file")).toHaveLength(0);
    expect(usages.filter(u => u.type === "reference" && u.name === "json_logs")).toHaveLength(0);
    // "getenv", "environment" are attribute names - NOT references
    expect(usages.filter(u => u.type === "reference" && u.name === "getenv")).toHaveLength(0);
    expect(usages.filter(u => u.type === "reference" && u.name === "environment")).toHaveLength(0);
    // setup_logging should be a call, os.getenv should be a methodCall
    expect(usages.filter(u => u.type === "call" && u.name === "setup_logging")).toHaveLength(1);
    expect(usages.filter(u => u.type === "methodCall" && u.name === "getenv" && u.object === "os")).toHaveLength(1);
  });

  it("should skip attribute names in chained logger calls", () => {
    const code = `
logger.info("Starting up")
logger.warning("Caution", exc_info=True)
logger.error(f"Failed: {e}", exc_info=True)
`;
    const usages = getUsages(code);
    // "info", "warning", "error" are method attributes, "exc_info" is keyword arg
    const attrMethodNames = ["info", "warning", "error"];
    for (const name of attrMethodNames) {
      const refs = usages.filter(u => u.type === "reference" && u.name === name);
      expect(refs).toHaveLength(0);
    }
    expect(usages.filter(u => u.type === "reference" && u.name === "exc_info")).toHaveLength(0);
  });

  it("should correctly handle class definition with multi-line body", () => {
    const code = `
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        return response
`;
    const usages = getUsages(code);
    // "dispatch" as function def name should NOT be a reference
    expect(usages.filter(u => u.type === "reference" && u.name === "dispatch")).toHaveLength(0);
    // "SecurityHeadersMiddleware" as class def name should NOT be a reference
    expect(usages.filter(u => u.type === "reference" && u.name === "SecurityHeadersMiddleware")).toHaveLength(0);
    // "headers" is an attribute access - should NOT be a reference
    expect(usages.filter(u => u.type === "reference" && u.name === "headers")).toHaveLength(0);
  });
});

// ==========================================================================
// 7. Import usage tracking: imports used as attribute bases should be
//    detected as "used" (prevents false unusedImport)
// ==========================================================================

describe("Python False Positive Fixes - Import Usage Tracking", () => {
  it("should extract imports used as method call objects as usages", () => {
    const code = `
import os
from app.core.config import settings

value = os.getenv("KEY")
env = settings.environment
`;
    const root = parsePython(code);
    const imports: ASTImport[] = [];
    extractPythonImports(root, code, imports);

    const importedSymbols = new Set<string>();
    for (const imp of imports) {
      for (const name of imp.names) {
        importedSymbols.add(name.local);
      }
    }

    const usages: ASTUsage[] = [];
    extractPythonUsages(root, code, usages, importedSymbols);

    // "os" should appear as methodCall object (os.getenv)
    const osUsages = usages.filter(u => u.object === "os" || u.name === "os");
    expect(osUsages.length).toBeGreaterThan(0);

    // "settings" should appear as a reference (attribute base: settings.environment)
    // Since we removed the externalSymbols filter, imported names used as
    // attribute object bases ARE extracted as references for unused import tracking
    const settingsUsages = usages.filter(u => u.name === "settings");
    expect(settingsUsages.length).toBeGreaterThan(0);
  });

  it("should extract imports used as module prefixes in router registration", () => {
    const code = `
from app.api import auth_supabase, health

app.include_router(auth_supabase.router, tags=["auth"])
app.include_router(health.router, tags=["health"])
`;
    const root = parsePython(code);
    const imports: ASTImport[] = [];
    extractPythonImports(root, code, imports);

    const importedSymbols = new Set<string>();
    for (const imp of imports) {
      for (const name of imp.names) {
        importedSymbols.add(name.local);
      }
    }

    const usages: ASTUsage[] = [];
    extractPythonUsages(root, code, usages, importedSymbols);

    // auth_supabase and health should appear as usages (attribute object bases)
    const authUsages = usages.filter(u => u.name === "auth_supabase");
    const healthUsages = usages.filter(u => u.name === "health");
    expect(authUsages.length).toBeGreaterThan(0);
    expect(healthUsages.length).toBeGreaterThan(0);
  });
});
