# Contextual Naming Heuristics Feature

## Overview

Added "Trust but Verify" contextual naming heuristics to eliminate false positives for common coding patterns. The system now recognizes intent-based variable names and auto-whitelists their expected methods.

## What Was Implemented

### Core Module: `src/tools/validation/contextualNaming.ts`

A new validation layer that recognizes common naming conventions and automatically whitelists standard methods:

**Event Handlers** (`e`, `event`, `evt`)
- DOM Event API: `preventDefault()`, `stopPropagation()`, `target`, `currentTarget`
- Keyboard events: `key`, `keyCode`, `ctrlKey`, `shiftKey`
- Mouse events: `clientX`, `clientY`, `button`
- React SyntheticEvent: `nativeEvent`, `persist()`, `isPropagationStopped()`

**HTTP Objects** (`req`, `request`, `res`, `response`)
- Request: `body`, `params`, `query`, `headers`, `method`, `url`
- Response: `status()`, `json()`, `send()`, `redirect()`
- Fetch API: `ok`, `text()`, `blob()`, `arrayBuffer()`

**Error Objects** (`err`, `error`, `exception`, `ex`)
- Standard: `message`, `name`, `stack`, `cause`
- Custom: `statusCode`, `code`, `isAxiosError`, `response`

**Context Objects** (`ctx`, `context`)
- Canvas: `fillRect()`, `strokeRect()`, `beginPath()`, `stroke()`
- Koa/Express: `request`, `response`, `throw()`, `redirect()`

### Integration

Modified `src/tools/validation/validation.ts` to check contextual patterns before flagging method calls as hallucinations:

```typescript
} else if (used.type === "methodCall") {
  // 0. Check contextual naming patterns first
  if (isContextuallyValid(used)) {
    continue; // Trust the vibe - this is a standard pattern
  }
  // ... rest of validation
}
```

### Extensibility

Teams can add custom patterns:

```typescript
const customPattern = createPattern({
  variablePattern: /^(db|database)$/i,
  allowedMembers: ["query", "execute", "connect", "close"],
  description: "Database connection object",
});

isContextuallyValid(usage, [customPattern]);
```

## Test Coverage

### Unit Tests (25 tests)
- Event handler patterns (8 tests)
- HTTP request/response patterns (3 tests)
- Error handling patterns (2 tests)
- Context object patterns (2 tests)
- Usage filtering and statistics (2 tests)
- Custom patterns (2 tests)
- Edge cases (3 tests)
- Built-in pattern exports (3 tests)

### Integration Tests (7 tests)
- Event handlers with validation pipeline
- HTTP handlers with validation pipeline
- Error handlers with validation pipeline
- Canvas context with validation pipeline
- Mixed scenarios
- Hallucination detection still works
- False positive reduction

**All 32 tests passing ✓**

## Impact

### Before
```typescript
const handleSubmit = (e) => {
  e.preventDefault(); // ❌ FLAGGED: Method 'preventDefault' not found on 'e'
  e.stopPropagation(); // ❌ FLAGGED: Method 'stopPropagation' not found on 'e'
};
```

### After
```typescript
const handleSubmit = (e) => {
  e.preventDefault(); // ✓ TRUSTED: Standard event handler pattern
  e.stopPropagation(); // ✓ TRUSTED: Standard event handler pattern
  e.fakeMethod(); // ❌ STILL FLAGGED: Not a standard method
};
```

## Benefits

1. **Reduced False Positives**: Eliminates noise from common patterns like `e.preventDefault()`
2. **Better Developer Experience**: Focuses on actual hallucinations, not standard code
3. **Framework Agnostic**: Works with React, Vue, Express, Koa, vanilla JS, etc.
4. **Extensible**: Teams can add their own naming conventions
5. **Zero Configuration**: Works out of the box with sensible defaults

## Performance

- **Minimal overhead**: Simple regex matching and Set lookups
- **Early exit**: Contextual check happens before expensive validation
- **No external dependencies**: Pure TypeScript implementation

## Future Enhancements

Potential additions based on team feedback:
- State management patterns (`store`, `state`, `dispatch`)
- Testing patterns (`mock`, `stub`, `spy`)
- Database patterns (`db`, `conn`, `client`)
- Logger patterns (`logger`, `log`)
- Configuration patterns (`config`, `env`, `settings`)

## Files Changed

- **New**: `src/tools/validation/contextualNaming.ts` (350 lines)
- **Modified**: `src/tools/validation/validation.ts` (added 5 lines)
- **New**: `tests/unit/contextualNaming.test.ts` (550 lines)
- **New**: `tests/unit/contextualNaming.integration.test.ts` (430 lines)

## Backward Compatibility

✓ Fully backward compatible - existing validation behavior unchanged for non-contextual patterns
