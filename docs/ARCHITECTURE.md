# CodeGuardian Architecture

This document explains how CodeGuardian’s validation pipeline works, where Tree-sitter AST parsing is used, and where (limited) heuristics still exist.

## 1) High-level flow

The primary entrypoint is the MCP tool implementation in [`src/tools/validateCode.ts`](../src/tools/validateCode.ts:1).

At a high level, validation follows this pattern:

1. **Parse imports/usages/symbols from the *new code*** using Tree-sitter extractors
   - Unified extractor API: [`src/tools/validation/extractors/index.ts`](../src/tools/validation/extractors/index.ts:1)
   - Parser cache / language selection: [`src/tools/validation/parser.ts`](../src/tools/validation/parser.ts:1)

2. **Build/refresh project context** (symbol index, file index, symbol graph)
   - Validator consumes the context’s `symbolIndex` via [`buildSymbolTable()`](../src/tools/validation/validation.ts:204)

3. **Validate**
   - Dependency hallucinations vs manifests: [`src/tools/validation/manifest.ts`](../src/tools/validation/manifest.ts:1)
   - Symbol existence / param-count checks / unused imports: [`src/tools/validation/validation.ts`](../src/tools/validation/validation.ts:1)
   - Dead-code scanning: [`src/tools/validation/deadCode.ts`](../src/tools/validation/deadCode.ts:1)
   - Per-file unused locals: [`src/tools/validation/unusedLocals.ts`](../src/tools/validation/unusedLocals.ts:1)

4. **(Optional) Verify findings to reduce false positives**
   - Heuristics are intentionally used here: [`src/analyzers/findingVerifier.ts`](../src/analyzers/findingVerifier.ts:1)

5. **Persist a report**
   - Report store: [`src/resources/validationReportStore.ts`](../src/resources/validationReportStore.ts:1)

## 2) AST parsing: “extractors” vs “code graph”

CodeGuardian uses Tree-sitter in two main ways:

### 2.1 Validation extractors (snippet + per-file analysis)

The validation pipeline uses a *unified extractor interface* that provides:

- symbol definitions: [`extractSymbolsAST()`](../src/tools/validation/extractors/index.ts:69)
- symbol usages: [`extractUsagesAST()`](../src/tools/validation/extractors/index.ts:137)
- imports: [`extractImportsAST()`](../src/tools/validation/extractors/index.ts:217)

Language-specific implementations:

- JS/TS: [`src/tools/validation/extractors/javascript.ts`](../src/tools/validation/extractors/javascript.ts:1)
- Python: [`src/tools/validation/extractors/python.ts`](../src/tools/validation/extractors/python.ts:1)

The parser used here is cached at module scope for performance: [`getParser()`](../src/tools/validation/parser.ts:36).

### 2.2 Code graph parsing (project-wide structure)

Separately, CodeGuardian can build a deeper project-wide graph (scopes, symbols, references, imports/exports) using:

- Tree-sitter code graph builder: [`TreeSitterParser`](../src/analyzers/parsers/treeSitterParser.ts:28)
- Scope-aware resolution: [`ScopeResolver`](../src/analyzers/parsers/scopeResolver.ts:19)

This is used for stronger cross-file reasoning (call graphs, references, scopes), and is intentionally more heavyweight than the per-file extractors.

## 3) Symbol tables used by different layers

There are *two* “symbol table” concepts:

1. **Validation-time project symbol table** (recommended)
   - Built from project context `symbolIndex` for fast validation: [`buildSymbolTable()`](../src/tools/validation/validation.ts:204)
   - This is what `validate_code`, async validation, and Guardian use.

2. **Legacy snippet-level symbol table** (kept for analyzer/tests)
   - File: [`src/analyzers/symbolTable.ts`](../src/analyzers/symbolTable.ts:1)
   - Now migrated to Tree-sitter extractors to avoid regex brittleness.

## 4) Where regex/heuristics are still acceptable

Some heuristics remain by design:

- Finding verification uses textual heuristics to reduce noise and is not “syntax authoritative”: [`src/analyzers/findingVerifier.ts`](../src/analyzers/findingVerifier.ts:1)
- A minimal CommonJS `require()` import bridge exists for snippet-level symbol tables (because Tree-sitter import extraction focuses on ESM): [`src/analyzers/symbolTable.ts`](../src/analyzers/symbolTable.ts:1)

Anything that affects *core correctness* (symbol extraction, usages, imports, dead code) should prefer AST.

## 5) Adding support for a new language (outline)

1. Add a Tree-sitter grammar and register it in the parser cache: [`src/tools/validation/parser.ts`](../src/tools/validation/parser.ts:1)
2. Add language-specific extractor(s) similar to:
   - [`src/tools/validation/extractors/javascript.ts`](../src/tools/validation/extractors/javascript.ts:1)
   - [`src/tools/validation/extractors/python.ts`](../src/tools/validation/extractors/python.ts:1)
3. Wire it into the unified API: [`src/tools/validation/extractors/index.ts`](../src/tools/validation/extractors/index.ts:1)
4. Add focused unit tests covering edge cases (imports, destructuring, decorators, async): [`tests/`](../tests:1)

