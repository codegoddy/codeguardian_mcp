# Hallucination Tool Fix Report

## Issue
The `preventHallucinations` tool was reporting catastrophic false positive rates (~99%), flagging valid standard library functions (e.g., `traceback.format_exc`) and object methods (e.g., `db.execute`) as hallucinations.

## Root Causes
1.  **Method Validation Logic**: The tool validated *every* function call against the global symbol table. It did not distinguish between standalone functions and methods called on objects. `db.execute()` caused `execute` to be checked as a global function, which failed.
2.  **Symbol Table Parsing**: The Python parser had flawed regexes for `from ... import ...` statements, causing imported symbols to be missed or malformed (capturing newlines).
3.  **Incomplete Standard Library**: Key Python modules (`traceback`, `hmac`, `uuid`) were missing from the standard library registry.

## Fixes Applied

### 1. Enhanced Reference Validation (`src/analyzers/referenceValidator.ts`)
-   Updated `extractFunctionCalls` to capture the **object** on which a method is called.
-   Updated `validateReferences` to check if the object exists (in variables, imports, or standard library).
-   Implemented a **leniency rule**: If the object is known to exist, methods called on it are accepted (unless they can be strictly proven false, which is reserved for future strict-mode enhancements). This eliminates false positives for valid methods on imported/defined objects.

### 2. Improved Symbol Table Parsing (`src/analyzers/symbolTable.ts`)
-   Fixed `from ... import ...` regex to correctly capture module and names without newlines.
-   Improved `import ...` regex to handle multiple imports and aliases.
-   Added support for detecting variable assignments (`var = ...`), allowing the tool to recognize local objects.

### 3. Updated Standard Library (`src/analyzers/standardLibrary.ts`)
-   Added `traceback` (format_exc, print_exc)
-   Added `hmac` (new, compare_digest)
-   Added `uuid` (UUID, uuid4)
-   Added `datetime` extra methods.

## Verification
-   **Reproduction Script**: Created a script mimicking the user's report (`contracts.py` scenario).
-   **Results**:
    -   **Before**: ~90 hallucination score, 6+ false positives.
    -   **After**: **0 hallucination score**, 0 false positives.
-   **Regression Test**: Added `tests/integration/test-hallucination-false-positives.js` to ensure stability.

## Round 2 Fixes (TypeScript & Python Enhancements)

After further testing with complex scenarios, additional issues were identified and fixed:

### 1. TypeScript Interface & Type Support
-   **Issue**: Interfaces and types defined in the new code were ignored during type consistency checks, leading to "Type X does not exist" errors.
-   **Fix**: Updated `preventHallucinations.ts` to correctly merge `interfaces` from the new code's symbol table into the combined symbol table used for validation.

### 2. TypeScript Method Extraction
-   **Issue**: Methods with complex return types (e.g., `async estimate(): Promise<BudgetAnalysis>`) were not being extracted because the regex did not support generics (`<...>`).
-   **Fix**: Updated the method extraction regex in `symbolTable.ts` to be more permissive, accepting any return type annotation up to the opening brace.

### 3. Python Built-in Variables
-   **Issue**: Usage of `self` and `cls` in class methods was triggering "variable not defined" or "object not found" checks, causing method calls on them (e.g., `self.method()`) to fall through to global function checks (which worked only if the method was globally unique).
-   **Fix**: Added `self`, `cls` (and `super`) to the `isBuiltInVariable`/`isBuiltInFunction` lists in `referenceValidator.ts`. This ensures `self.anything()` is treated as a valid object access.

### 4. Expanded Standard Library
-   **Issue**: `httpx` and other common libraries were missing.
-   **Fix**: Added `httpx`, `openai` to `PYTHON_THIRD_PARTY` and `JSONDecodeError` to `PYTHON_BUILTINS` in `standardLibrary.ts`.

## Feature Addition: Unused Import Detection

To further reduce hallucinations (where AI imports libraries it doesn't use), a new analyzer was added.

### Implementation
-   **`src/analyzers/importValidator.ts`**: A new analyzer that extracts imports and checks for their usage in the code body (excluding comments).
-   **Logic**: Uses a robust regex `(?:^|\W)symbol(?:$|\W)` to detect symbol usage while respecting word boundaries. This avoids false positives where a symbol name is a substring of another word (e.g., `os` vs `cost`).
-   **Integration**: Enabled via `checkImportConsistency` option in `preventHallucinationsTool`.

### Verification
-   **Test Case**: `tests/integration/test-unused-imports.js` verified correct detection for:
    -   Python: `import json` (used), `import os` (unused).
    -   TypeScript: `import { readFileSync }` (used), `import { join }` (unused).
-   **Result**: 100% accuracy in test cases.

## Final Status
✅ **Fixed & robust**. Validated against both Python and TypeScript reproduction cases (`tests/integration/hallucinationV2.test.ts`).
