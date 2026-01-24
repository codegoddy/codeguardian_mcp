# Method Call Hallucination Detection Fix

## Problem

CodeGuardian was missing method call hallucinations like:
- `SuperAnalytics.trackPageView()` - non-existent object
- `quantumState.entangle(theme)` - non-existent object  
- `AITaskPredictor.connect()` - non-existent object
- `TaskOptimizer.analyze(tasks)` - from hallucinated import

These were being missed because the validation logic had overly conservative guards that skipped method call validation in non-strict mode.

## Root Cause

The validation logic in `src/tools/validation/validation.ts` had two issues:

1. **Missing object existence check**: When validating method calls like `obj.method()`, the code wasn't checking if `obj` itself existed before trying to validate the method.

2. **Overly conservative validation**: The code only validated method calls if:
   - Strict mode was enabled, OR
   - The object was from an internal import, OR  
   - The object was from a hallucinated package

This meant that method calls on completely undefined objects (like `SuperAnalytics.trackPageView()`) were being skipped entirely.

3. **Unused import false positives**: When `logger.info()` was used, the unused import detector was only checking for usage of "info", not "logger", causing false positives.

## Solution

### 1. Added Object Existence Check (Lines 672-708)

```typescript
// 2. Check if the object itself exists
const objExists = 
  validClasses.has(used.object!) || 
  validVariables.has(used.object!) ||
  validFunctions.has(used.object!);

// If the object doesn't exist at all, flag it as a hallucination
if (!objExists) {
  const suggestion = suggestSimilar(used.object!, [...]);
  issues.push({
    type: "undefinedVariable",
    severity: "critical",
    message: `Object '${used.object}' is not defined or imported (used in ${used.object}.${used.name}())`,
    // ...
  });
  continue; // Skip method validation if object doesn't exist
}
```

This catches cases like `SuperAnalytics.trackPageView()` where `SuperAnalytics` doesn't exist anywhere.

### 2. Refined Method Validation Logic (Lines 710-730)

Changed from validating all internal imports to only validating when we have class information:

```typescript
if (!shouldCheck) {
  const imp = imports.find((i) =>
    i.names.some((n) => n.local === used.object),
  );
  if (imp) {
    if (missingPackages.has(imp.module)) {
      shouldCheck = true; // Hallucinated import - definitely flag usages!
    } else if (!imp.isExternal) {
      // For internal imports, only check if we have class/method info
      // This avoids false positives on objects with dynamic methods
      const objClass = validClasses.get(used.object!);
      if (objClass) {
        shouldCheck = true; // We have class info, so we can validate methods
      }
    }
  }
}
```

This prevents false positives on objects like `logger` that have dynamic methods, while still catching real hallucinations.

### 3. Fixed Unused Import Detection (Lines 864-872)

Added object names from method calls to the used names set:

```typescript
const usedNames = new Set(usedSymbols.map((u) => u.name));
// Also include object names from method calls (e.g., 'logger' in 'logger.info()')
for (const used of usedSymbols) {
  if (used.type === "methodCall" && used.object) {
    usedNames.add(used.object);
  }
}
```

This ensures that when `logger.info()` is used, both "logger" and "info" are marked as used.

## Test Results

Created comprehensive test suite in `tests/unit/methodCall.hallucination.test.ts`:

✅ **Test 1**: Catches method calls on non-existent objects
- `SuperAnalytics.trackPageView()` → Detected as `undefinedVariable`
- `AITaskPredictor.connect()` → Detected as `undefinedVariable`
- `QuantumStateManager.initialize()` → Detected as `undefinedVariable`

✅ **Test 2**: Catches method calls on imported but hallucinated objects
- Detects fake imports like `./fake-module.js`
- Reports as `nonExistentImport`

✅ **Test 3**: Catches method calls on objects from hallucinated packages
- Detects missing packages like `zustand/middleware`, `ai-predictor-lib`
- Reports as `dependencyHallucination`
- Also flags method calls on those objects as `nonExistentMethod`

✅ **Test 4**: Does NOT flag method calls on real imported objects
- `logger.info()` and `logger.debug()` are correctly validated
- No false positives on legitimate code

All 4 tests passing.

## Impact

This fix significantly improves CodeGuardian's ability to catch AI hallucinations involving method calls, which are extremely common in AI-generated code. The fix maintains the balance between catching real issues and avoiding false positives by:

1. Always checking if the object exists (catches obvious hallucinations)
2. Only validating methods when we have reliable type information (avoids false positives)
3. Properly tracking object usage in method calls (fixes unused import detection)

## Files Modified

- `src/tools/validation/validation.ts` - Core validation logic
- `tests/unit/methodCall.hallucination.test.ts` - New comprehensive test suite
