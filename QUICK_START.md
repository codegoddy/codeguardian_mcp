# 🚀 CodeGuardian: Quick Start Guide

Get up and running with CodeGuardian in 5 minutes.

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/codeguardian-mcp.git
cd codeguardian-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Start the MCP server
npm start
```

## Configuration

### For Claude Desktop

Add to your Claude Desktop config (`~/.claude/config.json`):

```json
{
  "mcpServers": {
    "codeguardian": {
      "command": "node",
      "args": ["/path/to/codeguardian-mcp/dist/server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### For Cursor

Add to Cursor's MCP configuration settings.

### For VS Code

Install the MCP extension and configure the server path.

## Quick Tutorial

### Prevent AI Hallucinations 🔥

**Scenario**: AI suggests code that references non-existent functions.

**Code**:
```typescript
// AI generated this:
const user = await getUserById(id);
const result = await userService.authenticateUser(user); // ❌ Doesn't exist!
```

**Run CodeGuardian**:
```
Use prevent_hallucinations tool with:
- codebase: your current code
- newCode: the AI-generated code
- language: typescript
```

**CodeGuardian Response**:
```json
{
  "hallucinationDetected": true,
  "hallucinationScore": 85,
  "issues": [
    {
      "type": "nonExistentFunction",
      "severity": "high",
      "message": "Function 'authenticateUser' does not exist in userService",
      "line": 2,
      "referencedCode": "userService.authenticateUser(user)",
      "actualCode": "Available methods: login(), verifyToken(), getUser()",
      "suggestion": "Use userService.login(user) or userService.verifyToken(token)",
      "confidence": 98
    }
  ],
  "recommendation": {
    "accept": false,
    "requiresReview": true,
    "riskLevel": "high",
    "action": "Fix function reference before proceeding"
  }
}
```

**Fixed Code**:
```typescript
const user = await getUserById(id);
const result = await userService.login(user); // ✅ Correct!
```

---

### Analyze Code Quality

**Run**:
```
Use analyze_code_quality tool with:
- code: your code
- language: typescript
- options: { checkAIPatterns: true }
```

**Response**:
```json
{
  "score": 72,
  "issues": [
    {
      "severity": "warning",
      "category": "AI-Pattern",
      "message": "Unnecessary abstraction - Interface only used once",
      "line": 15,
      "suggestion": "Consider inlining the interface",
      "autoFixable": true
    },
    {
      "severity": "error",
      "category": "Complexity",
      "message": "Function complexity too high (cyclomatic complexity: 15)",
      "line": 42,
      "suggestion": "Break function into smaller functions",
      "autoFixable": false
    }
  ],
  "metrics": {
    "complexity": 15,
    "maintainability": 65,
    "readability": 78
  },
  "estimatedFixTime": "30 minutes"
}
```

---

### Generate Tests

**Run**:
```
Use generate_tests tool with:
- code: your function
- language: typescript
- options: { includeEdgeCases: true }
```

**Response**:
```json
{
  "success": true,
  "tests": {
    "filePath": "user.test.ts",
    "content": "import { getUserById } from './user';\n\n...",
    "framework": "jest"
  },
  "coverage": {
    "lines": 95,
    "branches": 88,
    "functions": 100,
    "statements": 93
  },
  "testCases": [
    {
      "name": "should return user for valid ID",
      "type": "unit",
      "description": "Tests normal case with valid user ID"
    },
    {
      "name": "should throw error for invalid ID",
      "type": "edge-case",
      "description": "Tests error handling for invalid ID"
    },
    {
      "name": "should return null for non-existent user",
      "type": "edge-case",
      "description": "Tests null handling when user doesn't exist"
    }
  ]
}
```

---

### Run Security Scan

**Run**:
```
Use run_security_scan tool with:
- code: your code
- language: typescript
- severity: "medium"
```

**Response**:
```json
{
  "success": true,
  "vulnerabilities": [
    {
      "id": "SEC-001",
      "severity": "critical",
      "category": "Injection",
      "title": "SQL Injection Vulnerability",
      "description": "User input is directly concatenated into SQL query",
      "line": 23,
      "code": "const query = `SELECT * FROM users WHERE id = ${userId}`;",
      "owaspCategory": "A03:2021 - Injection",
      "fixRecommendation": "Use parameterized queries",
      "fixCode": "const query = 'SELECT * FROM users WHERE id = ?';\nawait db.query(query, [userId]);",
      "references": [
        "https://owasp.org/www-community/attacks/SQL_Injection"
      ]
    }
  ],
  "securityScore": 45,
  "summary": {
    "critical": 1,
    "high": 0,
    "medium": 2,
    "low": 1
  }
}
```

---

### Check Production Readiness

**Run**:
```
Use check_production_readiness tool with:
- projectPath: "/path/to/project"
- strictMode: false
```

**Response**:
```json
{
  "success": true,
  "ready": false,
  "overallScore": 78,
  "breakdown": {
    "quality": {
      "score": 82,
      "status": "pass",
      "issues": 3
    },
    "security": {
      "score": 45,
      "status": "fail",
      "vulnerabilities": 3
    },
    "tests": {
      "score": 65,
      "status": "warning",
      "coverage": 65
    },
    "documentation": {
      "score": 85,
      "status": "pass",
      "coverage": 85
    },
    "performance": {
      "score": 90,
      "status": "pass",
      "issues": 1
    }
  },
  "blockers": [
    {
      "category": "Security",
      "issue": "SQL Injection vulnerability in user service",
      "fix": "Use parameterized queries",
      "estimatedTime": "15 minutes"
    }
  ],
  "recommendation": {
    "deploy": false,
    "message": "Not ready for production - fix 1 critical security issue first",
    "nextSteps": [
      "Fix SQL injection in user service",
      "Improve test coverage to 80%+",
      "Document API endpoints"
    ]
  }
}
```

---

## Common Workflows

### 1. New Feature Development

```
1. Generate code with AI
2. Run prevent_hallucinations → fix any issues
3. Run analyze_code_quality → fix anti-patterns
4. Run generate_tests → create comprehensive tests
5. Run run_security_scan → fix vulnerabilities
6. Run check_production_readiness → get deployment score
7. Fix blockers and re-check
8. Deploy with confidence!
```

### 2. Debugging AI Code

```
1. Run prevent_hallucinations → catch reference errors
2. Run explain_code → understand what AI created
3. Run analyze_code_quality → identify issues
4. Run generate_tests → create tests to prevent regression
5. Fix and verify
```

### 3. Code Review

```
1. Run prevent_hallucinations → validate all references
2. Run analyze_code_quality → check quality
3. Run run_security_scan → ensure no vulnerabilities
4. Run check_production_readiness → final assessment
5. Provide feedback to developer
```

---

## Pro Tips

### 1. Catch Hallucinations Early
Run `prevent_hallucinations` immediately after AI generates code. This saves hours of debugging later.

### 2. Generate Tests Before Fixing
Generate tests first, then fix issues. Tests verify your fixes work.

### 3. Check Security Early
Run security scan before code review. Catch vulnerabilities before they reach production.

### 4. Track Your Progress
Use the Quality Dashboard to track improvements over time.

### 5. Learn from Explanations
Use `explain_code` to understand what AI created. This improves your skills.

---

## Keyboard Shortcuts (Coming Soon)

- `Ctrl+Shift+H` - Run hallucination detection on current file
- `Ctrl+Shift+Q` - Run full quality analysis
- `Ctrl+Shift+T` - Generate tests for current function
- `Ctrl+Shift+S` - Run security scan
- `Ctrl+Shift+P` - Check production readiness

---

## Getting Help

- **Documentation**: See `/docs` folder
- **Examples**: See `/examples` folder
- **GitHub Issues**: Report bugs at `/issues`
- **Discord**: Join our community server

---

## What's Next?

1. ✅ Install and configure CodeGuardian
2. ✅ Try the hallucination prevention demo
3. ✅ Run a full code quality analysis
4. ✅ Generate tests for your code
5. ✅ Check production readiness
6. 🚀 Build with confidence!

**Welcome to the future of vibe coding - fast AND reliable!** 🎉
