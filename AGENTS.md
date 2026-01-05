# CodeGuardian MCP - Project Overview

## Project Description

**CodeGuardian MCP** is an automated quality assurance tool designed specifically for "Vibe Coding" - the practice of using AI assistants to rapidly generate code. It addresses the critical challenges faced by developers who use AI coding tools, particularly the "70% wall" where projects can be built quickly to 70% completion but struggle with the final 30%.

## Core Purpose

CodeGuardian prevents AI hallucinations, detects code quality issues, generates comprehensive tests, scans for security vulnerabilities, and provides production readiness assessments - all through the Model Context Protocol (MCP).

## Key Features

### 🔥 Unique Winning Features

1. **AI Hallucination Prevention** - Detects when AI references non-existent functions, wrong imports, type mismatches, and logic contradictions
2. **AI-Specific Anti-Pattern Detection** - Identifies patterns common in AI-generated code (over-abstraction, dead code, generic error handling)
3. **Context-Aware Analysis** - Understands project conventions and provides tailored recommendations
4. **Intelligent Test Generation** - Creates tests that catch AI-generated bugs (null checks, type errors, edge cases)
5. **Production Readiness Assessment** - Provides actionable timeline and checklist for deployment

### Core Tools

- `prevent_hallucinations` - Real-time detection of AI hallucinations (non-existent references, import errors, type mismatches)
- `analyze_code_quality` - Comprehensive code quality analysis with AI-pattern detection
- `generate_tests` - Automated test generation for AI-generated code
- `run_security_scan` - Security vulnerability detection (OWASP Top 10, AI-specific risks)
- `check_production_readiness` - Holistic production readiness with scoring and recommendations

## Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk ^1.0.4
- **Static Analysis**: ESLint, Pylint, golangci-lint
- **Security**: Bandit (Python), njsscan (Node.js), Semgrep
- **Code Parsing**: Tree-sitter (multi-language support)
- **Test Frameworks**: Jest, Pytest

## Project Structure

```
codeguardian-mcp/
├── src/                          # Source code
│   ├── server.ts                 # MCP Server entry point
│   ├── tools/                    # Tool implementations
│   ├── analyzers/                # Language-specific analyzers
│   │   ├── javascript/
│   │   ├── python/
│   │   └── go/
│   ├── generators/               # Test generators
│   ├── scoring/                  # Quality scoring
│   ├── resources/                # MCP Resources
│   ├── prompts/                  # MCP Prompts
│   └── utils/                    # Shared utilities
├── rules/                        # Custom rules
│   ├── ai-patterns/              # AI anti-patterns
│   └── best-practices/           # Best practices
├── tests/                        # Test files
├── examples/                     # Example workflows
└── docs/                         # Documentation
```

## Supported Languages

- JavaScript
- TypeScript
- Python
- Go (planned)
- Java (planned)

## Key Design Principles

1. **Zero Friction** - No setup required beyond MCP server connection
2. **Language Agnostic** - Support all major programming languages
3. **Incremental Analysis** - Analyze only changed code for speed
4. **Context-Aware** - Understand project context and conventions
5. **Actionable Feedback** - Provide fixable, specific recommendations

## Problem Solved

Based on research (arXiv:2510.00328v1 - "Vibe Coding in Practice"):
- **36% of developers skip QA** when using AI coding tools
- **18% have uncritical trust** in AI-generated code
- **70% Wall** - Can build 70% quickly but get stuck on final 30%
- **32.5% comprehension gap** - Don't fully understand generated code
- **Hidden vulnerabilities** - AI code frequently contains security issues

CodeGuardian addresses all these pain points with automated, intelligent quality assurance.

## Performance Targets

- Code analysis: < 2 seconds per file
- Hallucination detection: < 1 second per check
- Security scan: < 5 seconds per file
- Test generation: < 10 seconds per function
- Production readiness: < 30 seconds for small projects

## Development Status

**Current Phase**: Foundation + Core Implementation
- ✅ Project structure established
- ✅ MCP server framework
- 🚧 Hallucination prevention tool (in progress)
- 🚧 Code quality analyzer (in progress)
- 📋 Test generation (planned)
- 📋 Security scanning (planned)
- 📋 Production readiness (planned)

## Getting Started

### Installation

```bash
npm install
npm run build
npm start
```

### Configuration

Add to your MCP client configuration (e.g., Claude Desktop):

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

## Use Cases

1. **Real-time Code Validation** - Check AI-generated code as you write
2. **Pre-commit Quality Gates** - Ensure code quality before committing
3. **Security Audits** - Scan for vulnerabilities in AI-generated code
4. **Test Coverage** - Generate comprehensive tests automatically
5. **Production Readiness** - Assess if code is ready to deploy

## Competitive Advantages

1. **🔥 AI Hallucination Prevention** - UNIQUE: Only tool that detects AI hallucinations in real-time
2. **AI-Specific Focus** - Designed for AI-generated code patterns
3. **Zero Configuration** - Works out of the box
4. **Actionable Results** - Every finding comes with fix suggestions
5. **Production Timeline** - Tells you when you can deploy
6. **Integrated Ecosystem** - Quality + Security + Tests + Readiness in one tool
7. **Speed Optimized** - Fast enough for real-time feedback

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Author

BridgeMind - Built for the BridgeMind Vibeathon

## Links

- Documentation: [IMPLEMENTATION.md](IMPLEMENTATION.md)
- Quick Start: [QUICK_START.md](QUICK_START.md)
- Implementation Updates: [IMPLEMENTATION_UPDATES.md](IMPLEMENTATION_UPDATES.md)
- Winning Strategy: [WINNING_STRATEGY.md](WINNING_STRATEGY.md)

---

**CodeGuardian MCP: Automated Quality Assurance for Vibe Coding**
