# CodeGuardian MCP

> **Tools that make AI coding assistants actually better**

CodeGuardian provides MCP tools that fill the gaps in what LLMs can do. Not pattern matching they already do well - but things like tracing dependencies across a codebase, finding dead code, and catching hallucinated function calls.

## The Philosophy

Most "AI coding tools" duplicate what LLMs already do:
- ❌ Security pattern matching (LLMs do this)
- ❌ Code quality analysis (LLMs do this)
- ❌ Test generation (LLMs do this)

CodeGuardian focuses on what LLMs **can't** do efficiently:
- ✅ Verify that referenced functions actually exist in YOUR codebase
- ✅ Trace dependency graphs across hundreds of files
- ✅ Find dead code and unused exports
- ✅ Identify what's NOT tested
- ✅ Resolve actual types after inference

## Quick Start

```bash
npm install && npm run build
```

Add to your MCP client config:

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

## Tools

### 🛡️ `validate_code` - Hallucination Detection

The core tool. Validates AI-generated code against your actual codebase.

```typescript
validate_code({
  projectPath: "src",
  newCode: `
    const user = await getUserById(id);
    const result = await userService.authenticateUser(user);
  `,
  language: "typescript"
})
```

**Output:**
```json
{
  "score": 25,
  "hallucinationDetected": true,
  "issues": [
    {
      "type": "nonExistentFunction",
      "severity": "critical",
      "message": "Function 'authenticateUser' does not exist in project",
      "suggestion": "Did you mean: authenticate, verifyUser?"
    }
  ],
  "recommendation": {
    "verdict": "REJECT",
    "message": "❌ DO NOT USE - 1 critical issue found"
  }
}
```

### 🔗 `get_dependency_graph` - Impact Analysis

Understand what depends on what. Essential for safe refactoring.

```typescript
get_dependency_graph({
  target: "src/auth/login.ts",
  language: "typescript",
  depth: 2
})
```

**Output:**
```json
{
  "files": {
    "src/auth/login.ts": {
      "imports": ["src/db/users.ts", "src/utils/crypto.ts"],
      "importedBy": ["src/routes/auth.ts", "src/middleware/session.ts"],
      "externalDeps": ["bcrypt", "jsonwebtoken"]
    }
  },
  "circularDependencies": []
}
```

### 💀 `find_dead_code` - Cleanup Helper

Find unused exports and orphaned files.

```typescript
find_dead_code({
  directory: "src",
  language: "typescript"
})
```

**Output:**
```json
{
  "unusedExports": [
    { "symbol": "formatDate", "file": "src/utils/legacy.ts", "line": 45 },
    { "symbol": "OldValidator", "file": "src/validators/deprecated.ts", "line": 12 }
  ],
  "orphanedFiles": ["src/helpers/unused.ts"],
  "recommendation": "Review and remove unused code"
}
```

### 🧪 `get_test_coverage_gaps` - What's NOT Tested

Don't generate tests - find what needs tests.

```typescript
get_test_coverage_gaps({
  sourceDir: "src",
  language: "typescript"
})
```

**Output:**
```json
{
  "gaps": [
    {
      "type": "function",
      "name": "validateToken",
      "file": "src/auth/jwt.ts",
      "priority": "high",
      "reason": "Exported function has no test",
      "suggestedTest": "test('validateToken should...', () => {...})"
    }
  ],
  "summary": {
    "totalFunctions": 45,
    "testedFunctions": 32,
    "coverageEstimate": 71
  }
}
```

### 🔍 `discover_context` - Smart File Discovery

Find relevant files for a task without reading everything.

```typescript
discover_context({
  projectPath: ".",
  query: "authentication login session"
})
```

### 📝 `resolve_types` - Type Resolution

Get the actual resolved type, not what you think it is.

```typescript
resolve_types({
  projectPath: ".",
  query: "getUserById"
})
```

**Output:**
```json
{
  "resolved": {
    "name": "getUserById",
    "resolvedType": "Promise<User | null>",
    "source": "function return type",
    "file": "src/db/users.ts"
  }
}
```

### 📁 `scan_directory` - Batch Validation

Validate an entire directory for hallucinations.

```typescript
scan_directory({
  directory: "src",
  language: "typescript",
  outputMode: "summary"
})
```

## Supported Languages

| Language   | Full Support |
|------------|--------------|
| TypeScript | ✅           |
| JavaScript | ✅           |
| Python     | ✅           |
| Go         | 🔄 Basic     |

## Why These Tools?

Each tool exists because it solves something LLMs genuinely struggle with:

| Tool | Why LLMs Need It |
|------|------------------|
| `validate_code` | LLMs hallucinate function names. They can't verify against your actual codebase. |
| `get_dependency_graph` | Tracing imports across 100+ files is slow and error-prone for LLMs. |
| `find_dead_code` | LLMs can't know what's actually called without analyzing the whole project. |
| `get_test_coverage_gaps` | LLMs can write tests but can't know what's NOT tested. |
| `resolve_types` | TypeScript inference is complex. LLMs often guess wrong. |

## Architecture

```
src/
├── tools/
│   ├── validateCode.ts        # Hallucination detection
│   ├── getDependencyGraph.ts  # Import/export tracing
│   ├── findDeadCode.ts        # Unused code detection
│   ├── getTestCoverageGaps.ts # Test gap analysis
│   ├── discoverContext.ts     # Smart file discovery
│   ├── resolveTypes.ts        # Type resolution
│   └── scanDirectory.ts       # Batch scanning
├── analyzers/                  # Shared analysis logic
└── server.ts                   # MCP server entry
```

## Contributing

PRs welcome. Focus on tools that help LLMs do things they can't do well on their own.

## License

MIT
