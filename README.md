# CodeGuardian MCP

> **The AI Code Validator - Catches hallucinations before they break your code**

CodeGuardian is an MCP server that validates AI-generated code against your actual codebase. It catches the mistakes AI makes - calling functions that don't exist, using wrong method names, and generating code that nothing uses.

## The Problem

AI coding assistants hallucinate. They generate code that:
- Calls functions that don't exist in your project
- Uses methods that aren't on your classes
- Creates files that nothing imports
- References APIs with wrong parameter names

These errors compile fine but break at runtime. CodeGuardian catches them first.

## Quick Start

```bash
npm install && npm run build
```

Add to your MCP client (Claude Desktop, Kiro, etc.):

```json
{
  "mcpServers": {
    "codeguardian": {
      "command": "node",
      "args": ["/path/to/codeguardian-mcp/dist/server.js"]
    }
  }
}
```

## Tools (3 focused tools)

### `validate_code` - The Flagship

Catches hallucinations AND dead code in one tool.

```typescript
// Validate AI-generated code
validate_code({
  projectPath: ".",
  newCode: "const user = getUserById(id); user.getFullName();",
  language: "typescript"
})

// Scan for dead code only
validate_code({
  projectPath: ".",
  language: "typescript",
  checkDeadCode: true
})
```

**Output:**
```json
{
  "score": 50,
  "hallucinationDetected": true,
  "hallucinations": [
    {
      "type": "nonExistentFunction",
      "severity": "critical",
      "message": "Function 'getUserById' does not exist in project",
      "suggestion": "Did you mean: findUserById, getUser?"
    }
  ],
  "deadCode": [],
  "recommendation": {
    "verdict": "REJECT",
    "message": "❌ DO NOT USE - 1 hallucination(s): references to non-existent code"
  }
}
```


### `build_context` - Speed Boost

Pre-builds project index for faster validation. Auto-called by `validate_code`, but you can call it explicitly to:
- Force rebuild after major changes
- Pre-warm cache before multiple validations

```typescript
build_context({
  projectPath: ".",
  forceRebuild: true  // Use after major changes
})
```

### `get_dependency_graph` - Impact Analysis

"What breaks if I change this file?"

```typescript
get_dependency_graph({
  target: "src/auth/login.ts",
  language: "typescript"
})
```

**Output:**
```json
{
  "target": "src/auth/login.ts",
  "imports": ["src/db/users.ts", "src/utils/crypto.ts"],
  "importedBy": ["src/routes/auth.ts", "src/middleware/session.ts"],
  "externalDeps": ["bcrypt", "jsonwebtoken"]
}
```

## What It Catches

**Hallucinations (CRITICAL):**
- `getUserById()` when function doesn't exist
- `user.getFullName()` when User class has no such method
- `import { foo } from './utils'` when utils doesn't export foo
- `new PaymentService()` when class doesn't exist

**Dead Code (CLEANUP):**
- Exported functions nothing imports
- Files nothing references
- Functions defined but never called

## What It Doesn't Flag

- New code being created (smart detection)
- External npm/pip packages (skipped)
- Built-in functions (console.log, print, etc.)
- Method calls on unknown types (avoids false positives)

## License

MIT
