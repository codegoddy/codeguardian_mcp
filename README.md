# CodeGuardian MCP

> **Catches AI hallucinations before they break your code**

An MCP server that validates AI-generated code against your actual codebase. It catches the #1 problem with vibe coding - LLMs confidently generating code that calls functions, classes, and methods that don't exist in your project.

## The Problem

AI coding assistants hallucinate. They generate code that:
- Calls `getUserById()` when your codebase has `findUserById()`
- Uses methods that aren't on your classes
- Imports from modules that don't export what they claim
- Creates dead code that nothing ever uses

These errors often compile fine but break at runtime. CodeGuardian catches them before you run.

## Installation

```bash
npm install && npm run build
```

Add to your MCP client (Claude Desktop, Kiro, Cursor, etc.):

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

## Agent Integration (The Vibe Guard Protocol)

We recommend a "Dual-Mode" strategy for agents integrating with CodeGuardian:

| Agent Type | Tool | When to Use | Goal |
| :--- | :--- | :--- | :--- |
| **Self-Correcting Agent** | `validate_code` | **Immediately** after generating any code. | Catch hallucinations (imports/functions) before showing the user. |
| **Guardian Agent** | `validate_code` logic | On **File Save** / Watch. | Real-time "red squiggly" feedback and "Blast Radius" alerts. |
| **Auditor Agent** | `start_validation` | On **Demand** / Review. | Full project health check, finding dead code, or reviewing legacy code. |

## Tools

### `validate_code`

The main tool. Validates AI-generated code snippets against your project's actual symbols with confidence scoring and reasoning. Best for small code snippets or individual files.

```typescript
// Basic validation
validate_code({
  projectPath: ".",
  newCode: "const user = getUserById(id);",
  language: "typescript"
})

// Strict mode (requires explicit imports)
validate_code({
  projectPath: ".",
  newCode: "...",
  language: "typescript",
  strictMode: true
})

// Scan for dead code
validate_code({
  projectPath: ".",
  language: "typescript",
  checkDeadCode: true
})
```

**What it returns:**
```json
{
  "score": 50,
  "hallucinationDetected": true,
  "hallucinations": [
    {
      "type": "nonExistentFunction",
      "severity": "critical", 
      "message": "Function 'getUserById' does not exist in project",
      "line": 5,
      "code": "const user = getUserById(id);",
      "suggestion": "Did you mean: findUserById, getUser?",
      "confidence": 95,
      "reasoning": "Searched 1,247 symbols in project. Found no function named 'getUserById'. Similar functions found using fuzzy matching."
    }
  ],
  "recommendation": {
    "verdict": "REJECT",
    "riskLevel": "critical",
    "message": "❌ DO NOT USE - 1 hallucination(s): references to non-existent code",
    "action": "Fix all critical issues before using this code"
  }
}
```

**New Features:**
- **Confidence Scores** (0-100%): How certain we are about each issue
- **Reasoning**: Explains WHY something is flagged
- **Score Interpretation**: 90-100 (safe), 70-89 (review), 50-69 (fix), <50 (critical)
- **Verdict Levels**: REJECT, REVIEW, CAUTION, ACCEPT

### `validate_code_batch`

**NEW:** Validates entire codebases without timeouts. Processes files in batches to stay under MCP timeout limits while providing comprehensive validation.

**Use this when:**
- Validating large codebases (100+ files)
- Getting timeout errors with `validate_code`
- Need comprehensive validation of all project files

```typescript
// Validate entire frontend directory
validate_code_batch({
  projectPath: "/path/to/frontend",
  language: "typescript",
  batchSize: 50  // Process 50 files at a time (default)
})

// Smaller batches for very large projects
validate_code_batch({
  projectPath: ".",
  language: "typescript",
  batchSize: 25,
  includeTests: false  // Skip test files
})
```

**What it returns:**
```json
{
  "score": 85,
  "hallucinationDetected": true,
  "deadCodeDetected": false,
  "hallucinations": [...],  // All issues found across codebase
  "deadCode": [...],
  "summary": {
    "totalIssues": 12,
    "criticalIssues": 3,
    "highIssues": 5,
    "mediumIssues": 4,
    "deadCodeIssues": 0
  },
  "stats": {
    "filesScanned": 202,
    "filesProcessed": 202,
    "batchCount": 5,
    "batchSize": 50,
    "symbolsInProject": 1911,
    "contextBuildTime": "20500ms",
    "validationTime": "8200ms",
    "totalTime": "28700ms"
  }
}
```

**How it works:**
1. Builds project context once (indexes all symbols)
2. Processes files in configurable batches
3. Aggregates results across all batches
4. Returns comprehensive report with all issues

**Performance:**
- 200-file codebase: ~30 seconds
- 500-file codebase: ~60 seconds
- 1000-file codebase: ~120 seconds

### `build_context`

Pre-builds project index for faster validation. Called automatically by `validate_code`, but useful for:
- Forcing rebuild after major changes (`forceRebuild: true`)
- Pre-warming cache before batch validations

```typescript
build_context({
  projectPath: ".",
  forceRebuild: true
})
```

### `get_dependency_graph`

Shows what files depend on what. Useful for understanding impact of changes.

```typescript
get_dependency_graph({
  target: "src/auth/login.ts",
  language: "typescript"
})
```

Returns imports, importedBy, and external dependencies.

## Prompts

CodeGuardian provides multiple validation prompts based on prompt engineering best practices:

### Available Prompts

1. **`validate`** - Basic validation (zero-shot)
   - Quick check for hallucinations
   - Best for: Simple code snippets

2. **`validate-detailed`** - Chain-of-thought reasoning
   - Step-by-step validation with detailed reasoning
   - Best for: Complex code requiring analysis

3. **`validate-with-examples`** - Few-shot learning
   - Validation with examples of common AI mistakes
   - Best for: Learning patterns and improving over time

4. **`validate-comprehensive`** - Multi-perspective analysis
   - Validates from multiple angles (symbols, dependencies, logic)
   - Best for: Critical code requiring thorough review

5. **`validate-structured`** - Structured output
   - Explicit format for automated processing
   - Best for: CI/CD integration

### Usage

Prompts are used by AI assistants (Claude, ChatGPT, etc.) to guide validation:

```
Use the validate-detailed prompt to check this code:
[your code here]
```

## What It Catches

| Type | Example | Severity | Confidence |
|------|---------|----------|------------|
| Non-existent function | `getUserById()` when it doesn't exist | Critical | 95% |
| Non-existent class | `new PaymentService()` when undefined | Critical | 95% |
| Bad import | `import { foo } from './utils'` when not exported | Critical | 93% |
| Missing dependency | `import 'react-ui'` not in package.json | Critical | 95% |
| Wrong method | `user.getFullName()` on class without it | Medium | 70% |
| Wrong param count | `func(a, b)` when expects 3 params | High | 88% |
| Dead export | Exported function nothing imports | Medium | 85% |
| Hardcoded credentials | `API_KEY = 'sk_live_...'` | Critical | 85% |

## What It Skips (No False Positives)

- External packages (npm/pip) - not your code
- Built-ins (`console.log`, `print`, `Math.random`)
- New code being created in the same snippet
- Entry points (`index.ts`, `main.py`)
- Test files

## Supported Languages

- TypeScript / JavaScript
- Python
- Go (partial)

## How It Works

1. **AST Parsing** - Uses tree-sitter to parse your codebase and extract all symbols (functions, classes, methods, exports)
2. **Context Building** - Builds a searchable index of your project's symbols with caching
3. **Validation** - Compares AI-generated code against the index, flags anything that doesn't exist
4. **Suggestions** - Uses fuzzy matching to suggest what the LLM probably meant

## Limitations

- Doesn't catch logic errors (that's still on you)
- Dynamic code (`eval`, reflection) can't be tracked
- Method calls on untyped objects may be skipped to avoid false positives
- Very large monorepos (>1000 files) should use `validate_code_batch` with appropriate batch sizes

## License

MIT
