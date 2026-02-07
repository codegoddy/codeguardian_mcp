# CodeGuardian MCP

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/MCP%20Server-FF6B6B?style=for-the-badge&logo=server&logoColor=white" alt="MCP Server">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AI%20Hallucination%20Detection-00C853?style=for-the-badge&logo=artificial-intelligence&logoColor=white" alt="AI Hallucination Detection">
  <img src="https://img.shields.io/badge/Dead%20Code%20Detection-FF9800?style=for-the-badge&logo=code&logoColor=white" alt="Dead Code Detection">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License">
</p>

<p align="center">
  <b>Catches AI hallucinations before they break your code</b>
</p>

<p align="center">
  <a href="#installation">Installation</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#tools">Tools</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## The Problem

AI coding assistants hallucinate. They generate code that **compiles fine but breaks at runtime**:

```typescript
// [X] AI generates this:
const user = getUserById(id);  // Function doesn't exist!

// [OK] Your codebase has:
const user = findUserById(id);  // Correct function name
```

**Common AI Hallucinations:**
- [CRITICAL] Calling `getUserById()` when your codebase has `findUserById()`
- [CRITICAL] Using methods that aren't on your classes
- [CRITICAL] Importing from modules that don't export what they claim
- [CRITICAL] Creating dead code that nothing ever uses

## The Solution

CodeGuardian validates AI-generated code against your **actual codebase** before you run it.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  AI Generates   │────▶│  CodeGuardian    │────▶│  Issues Found   │
│     Code        │     │   Validates      │     │  + Suggestions  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                         │
         ▼                       ▼                         ▼
   Vibe Coding              AST Parsing              Fix Before
   Confidently              Symbol Matching          Runtime
```

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/codeguardian-mcp.git
cd codeguardian-mcp

# Install dependencies
pnpm install

# Build the project
pnpm run build
```

### MCP Client Configuration

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

## Features

### AI Hallucination Detection
Catches non-existent functions, classes, and methods with **95% confidence**

### Confidence Scoring
Every issue includes a confidence score (0-100%) and detailed reasoning

| Score | Level | Action |
|-------|-------|--------|
| 0-49 | Critical | **REJECT** - Major hallucinations detected |
| 50-69 | Low | **REVIEW** - Multiple issues need attention |
| 70-89 | Medium | **CAUTION** - Minor issues, review suggested |
| 90-100 | High | **ACCEPT** - Code is safe to use |

### Dead Code Detection
Finds exported functions and classes that nothing imports

### Multi-Language Support
- **TypeScript / JavaScript** [SUPPORTED]
- **Python** [SUPPORTED]
- **Go** (partial)

### Real-Time Validation
Validates code immediately after generation with sub-second response times

## Tools

### `validate_code`

The main tool. Validates AI-generated code snippets against your project's actual symbols.

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

**Example Output:**
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
    "message": "DO NOT USE - 1 hallucination(s): references to non-existent code",
    "action": "Fix all critical issues before using this code"
  }
}
```

### `validate_code_batch`

**NEW:** Validates entire codebases without timeouts. Perfect for large projects (100+ files).

```typescript
// Validate entire frontend directory
validate_code_batch({
  projectPath: "/path/to/frontend",
  language: "typescript",
  batchSize: 50
})
```

**Performance:**
- 200 files: ~30 seconds
- 500 files: ~60 seconds
- 1000 files: ~120 seconds

### `get_dependency_graph`

Shows what files depend on what. Understand the impact of changes.

```typescript
get_dependency_graph({
  target: "src/auth/login.ts",
  language: "typescript"
})
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

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    CodeGuardian Pipeline                     │
├─────────────────────────────────────────────────────────────┤
│  1. AST Parsing                                              │
│     └─> Uses tree-sitter to parse your codebase              │
│     └─> Extracts all symbols (functions, classes, methods)   │
│                                                              │
│  2. Context Building                                         │
│     └─> Builds searchable index of project symbols           │
│     └─> Caches for fast subsequent validations               │
│                                                              │
│  3. Validation                                               │
│     └─> Compares AI-generated code against index             │
│     └─> Flags anything that doesn't exist                    │
│                                                              │
│  4. Suggestions                                              │
│     └─> Uses fuzzy matching to suggest corrections           │
│     └─> Provides confidence scores and reasoning             │
└─────────────────────────────────────────────────────────────┘
```

## Agent Integration (Vibe Guard Protocol)

We recommend a **"Dual-Mode"** strategy for agents:

| Agent Type | Tool | When to Use | Goal |
| :--- | :--- | :--- | :--- |
| **Self-Correcting Agent** | `validate_code` | **Immediately** after generating code | Catch hallucinations before showing user |
| **Guardian Agent** | `validate_code` logic | On **File Save** / Watch | Real-time "red squiggly" feedback |
| **Auditor Agent** | `start_validation` | On **Demand** / Review | Full project health check |

## Prompts

CodeGuardian provides validation prompts based on prompt engineering best practices:

1. **`validate`** - Quick zero-shot validation for simple snippets
2. **`validate-detailed`** - Chain-of-thought reasoning for complex code
3. **`validate-with-examples`** - Few-shot learning with common AI mistakes
4. **`validate-comprehensive`** - Multi-perspective analysis for critical code
5. **`validate-structured`** - Structured output for CI/CD integration

## What It Skips (No False Positives)

- [OK] External packages (npm/pip) - not your code
- [OK] Built-ins (`console.log`, `print`, `Math.random`)
- [OK] New code being created in the same snippet
- [OK] Entry points (`index.ts`, `main.py`)
- [OK] Test files

## Limitations

- Doesn't catch logic errors (that's still on you)
- Dynamic code (`eval`, reflection) can't be tracked
- Method calls on untyped objects may be skipped to avoid false positives
- Very large monorepos (>1000 files) should use `validate_code_batch`

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

<p align="center">
  <b>Made by developers who are tired of AI hallucinations</b>
</p>

<p align="center">
  <a href="https://github.com/yourusername/codeguardian-mcp">Star us on GitHub</a> &bull;
  <a href="https://github.com/yourusername/codeguardian-mcp/issues">Report Issues</a> &bull;
  <a href="https://github.com/yourusername/codeguardian-mcp/discussions">Discussions</a>
</p>
