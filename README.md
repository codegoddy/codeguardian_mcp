# CodeGuardian MCP

<p align="center">
  <img src="https://img.shields.io/npm/v/codeguardian-mcp?style=for-the-badge&color=FF6B6B" alt="npm version">
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
  <a href="#connecting-to-your-mcp-client">Connect MCP</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#all-tools">All Tools</a> &bull;
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

### Prerequisites

- **Node.js** v20 or higher ([Download](https://nodejs.org/))

### Install from npm

```bash
# Using npx (no install needed — recommended)
npx codeguardian-mcp

# Or install globally
npm install -g codeguardian-mcp

# Or with pnpm
pnpm add -g codeguardian-mcp
```

### Install from source (for contributors)

```bash
git clone https://github.com/codegoddy/codeguardian_mcp.git
cd codeguardian_mcp
pnpm install
pnpm run build
```

## Connecting to Your MCP Client

Add CodeGuardian to your MCP client config. No cloning or building required — `npx` handles everything.

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "codeguardian": {
      "command": "npx",
      "args": ["-y", "codeguardian-mcp"]
    }
  }
}
```

**Windsurf** (`mcp_config.json`):
```json
{
  "mcpServers": {
    "codeguardian": {
      "command": "npx",
      "args": ["-y", "codeguardian-mcp"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "codeguardian": {
      "command": "npx",
      "args": ["-y", "codeguardian-mcp"]
    }
  }
}
```

**OpenCode** (`opencode.json` in your project root):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "codeguardian": {
      "type": "local",
      "command": ["npx", "-y", "codeguardian-mcp"],
      "enabled": true
    }
  }
}
```

**Gemini CLI** (`settings.json`):
```json
{
  "mcpServers": {
    "codeguardian": {
      "command": "npx",
      "args": ["-y", "codeguardian-mcp"]
    }
  }
}
```

**Claude Code** (CLI):
```bash
claude mcp add --transport stdio codeguardian -- npx -y codeguardian-mcp
```

Restart your IDE / MCP client for the changes to take effect. You should see CodeGuardian's tools become available.

> **Note:** If you installed globally (`npm install -g codeguardian-mcp`), you can use `"command": "codeguardian-mcp"` with no args instead of `npx`.

## Quick Start

The two primary tools that handle everything for you:

### `start_validation` — Full Project Health Check

Scans your entire codebase for hallucinations, dead code, and bad imports. Best for on-demand audits.

> **Where to run:** From the **specific subdirectory** you want to validate (e.g., `frontend/` or `backend/`), not the monorepo root.

```
# Example: Validate frontend only
cd /path/to/your/project/frontend
start_validation({
  projectPath: "/path/to/your/project/frontend",
  language: "typescript"
})

# Example: Validate backend only  
cd /path/to/your/project/backend
start_validation({
  projectPath: "/path/to/your/project/backend", 
  language: "python"
})
```

This runs in the background (no timeouts). Check progress and get results with:
- `get_validation_status({ jobId: "..." })` — poll progress
- `get_validation_results({ jobId: "..." })` — get the final report

### `start_guardian` — Real-Time File Watcher

Watches your project and automatically validates files as you (or your AI) edit them. Runs continuously in the background.

> **Where to run:** From the **project root directory** (monorepo root). Guardian will auto-detect and watch all subprojects (frontend, backend, etc.).

```
# Run from project root (monorepo root)
cd /path/to/your/project
start_guardian({
  projectPath: "/path/to/your/project",
  language: "typescript"  // or "python" or "auto"
})
```

Once running, it catches issues in real-time across all subprojects. Use these companion tools:
- `get_guardian_alerts` — see current issues found by the watcher
- `get_guardian_status` — check which guardians are active  
- `stop_guardian` — stop a guardian when done

> **Tip:** These two tools handle everything without needing to call individual validation tools manually. `start_validation` for focused audits on specific subdirectories, `start_guardian` for continuous protection across the entire project.

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

### API Contract Validation
Detects mismatches between frontend and backend — wrong endpoints, missing fields, type incompatibilities

### Multi-Language Support
- **TypeScript / JavaScript** — full support
- **Python** — full support

### Full-Stack Projects
Automatically detects full-stack projects (e.g. React + FastAPI, Next.js + Express) and validates each language correctly.

### Real-Time Validation
Validates code immediately after generation with sub-second response times

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
| API contract mismatch | Frontend calls endpoint that doesn't exist on backend | Critical | 90% |

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

## All Tools

### Primary Tools (start here)

| Tool | Description |
|------|-------------|
| `start_validation` | Full project scan — runs in background, no timeouts. Use for on-demand audits. |
| `start_guardian` | Real-time file watcher — validates files as they change. Use for continuous protection. |

### Validation Job Tools

| Tool | Description |
|------|-------------|
| `get_validation_status` | Poll progress of a `start_validation` job |
| `get_validation_results` | Get final results when a validation job completes |

### Guardian Tools

| Tool | Description |
|------|-------------|
| `get_guardian_alerts` | Get current issues found by active guardians |
| `get_guardian_status` | Check which guardians are running |
| `stop_guardian` | Stop a specific guardian or all guardians |

### Individual Tools

| Tool | Description |
|------|-------------|
| `validate_code` | Validate a single code snippet against your project's symbols |
| `build_context` | Build/rebuild project symbol index (usually auto-called) |
| `get_dependency_graph` | Show what files depend on what — understand the blast radius of changes |

### API Contract Tools

| Tool | Description |
|------|-------------|
| `validate_api_contracts` | Validate frontend/backend API contract compatibility |
| `get_api_contract_report` | Generate a detailed API contract validation report |

## What It Skips (No False Positives)

- [OK] External packages (npm/pip) - not your code
- [OK] Built-ins (`console.log`, `print`, `Math.random`)
- [OK] New code being created in the same snippet
- [OK] Entry points (`index.ts`, `main.py`)
- [OK] Test files

## Limitations

- **No Python type inference** — CodeGuardian uses static AST analysis, not a type system. It cannot resolve types through variable assignments, function return values, or chained calls. For example, if `db.query(User)` returns a `Query` object and you call `.filter()` on it, CodeGuardian cannot verify that `.filter()` is a valid method because it doesn't track the return type of `db.query()`. This would require building a mini mypy-style type checker, which is out of scope. Python method calls on dynamically-typed variables are skipped to avoid false positives.
- Doesn't catch logic errors (that's still on you)
- Dynamic code (`eval`, reflection) can't be tracked
- Method calls on untyped objects may be skipped to avoid false positives
- Very large monorepos (>1000 files) should use `start_validation` with batching

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

<p align="center">
  <b>Made by developers who are tired of AI hallucinations</b>
</p>

<p align="center">
  <a href="https://github.com/codegoddy/codeguardian_mcp">Star us on GitHub</a> &bull;
  <a href="https://github.com/codegoddy/codeguardian_mcp/issues">Report Issues</a> &bull;
  <a href="https://github.com/codegoddy/codeguardian_mcp/discussions">Discussions</a>
</p>
