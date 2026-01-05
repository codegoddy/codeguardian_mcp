# CodeGuardian MCP - Example Usage

## Basic Usage Scenarios

### 1. Prevent Hallucinations (Core Feature)

**Scenario**: AI generates code that references a non-existent function

```javascript
// AI-generated code (with hallucination)
async function processUser(userId) {
  const user = await getUserById(userId);
  const result = await userService.authenticateUser(user); // ❌ This function doesn't exist!
  return result;
}
```

**CodeGuardian Detection**:

```json
{
  "tool": "prevent_hallucinations",
  "input": {
    "codebase": "... existing codebase ...",
    "newCode": "... AI generated code ...",
    "language": "javascript"
  },
  "output": {
    "hallucinationDetected": true,
    "hallucinationScore": 45,
    "issues": [
      {
        "type": "nonExistentFunction",
        "severity": "high",
        "message": "Function 'authenticateUser' does not exist in codebase",
        "line": 3,
        "suggestion": "Available functions: login, verifyToken, getUser"
      }
    ],
    "recommendation": {
      "accept": false,
      "riskLevel": "high",
      "action": "⚠️ HIGH RISK - Manual review required before use"
    }
  }
}
```

### 2. Analyze Code Quality

**Scenario**: Check AI-generated code for quality issues

```javascript
// AI-generated code (with quality issues)
function processData(data) {
  try {
    console.log(data);
    // ... lots of nested logic ...
    if (data) {
      if (data.items) {
        if (data.items.length > 0) {
          for (let i = 0; i < data.items.length; i++) {
            if (data.items[i].active) {
              // Deep nesting!
            }
          }
        }
      }
    }
  } catch (e) {
    console.log(e); // Generic error handling
  }
}
```

**CodeGuardian Detection**:

```json
{
  "tool": "analyze_code_quality",
  "input": {
    "code": "... code above ...",
    "language": "javascript"
  },
  "output": {
    "score": 65,
    "issues": [
      {
        "type": "deepNesting",
        "severity": "medium",
        "message": "Code is deeply nested (level 5)",
        "suggestion": "Consider extracting nested logic into separate functions"
      },
      {
        "type": "genericErrorHandling",
        "severity": "medium",
        "message": "Generic error handling without proper error management",
        "suggestion": "Implement specific error handling with proper error types"
      }
    ],
    "estimatedFixTime": "9 minutes"
  }
}
```

### 3. Generate Tests

**Scenario**: Automatically generate tests for AI code

```javascript
// Function to test
function calculateDiscount(price, discountPercent) {
  return price - (price * discountPercent / 100);
}
```

**CodeGuardian Usage**:

```json
{
  "tool": "generate_tests",
  "input": {
    "code": "... function above ...",
    "language": "javascript",
    "options": {
      "includeEdgeCases": true
    }
  },
  "output": {
    "tests": {
      "framework": "jest",
      "content": "... generated test code ..."
    },
    "testCases": [
      { "name": "should calculate discount correctly", "type": "unit" },
      { "name": "should handle zero discount", "type": "edge-case" },
      { "name": "should handle negative price", "type": "edge-case" },
      { "name": "should handle 100% discount", "type": "edge-case" }
    ]
  }
}
```

### 4. Complete Workflow

**End-to-end validation of AI-generated feature**:

```bash
1. AI generates new feature code
2. Run prevent_hallucinations → Catch reference errors
3. Fix hallucinations
4. Run analyze_code_quality → Check for anti-patterns
5. Fix quality issues
6. Run generate_tests → Create test suite
7. Run run_security_scan → Check for vulnerabilities
8. Run check_production_readiness → Final assessment
9. Deploy with confidence!
```

## MCP Prompts

CodeGuardian provides built-in prompts for common tasks:

### Review Code Prompt

```
"Review this AI-generated code for production readiness"
```

This triggers:
1. Hallucination check
2. Quality analysis
3. Security scan
4. Comprehensive report

### Check Hallucinations Prompt

```
"Check this code for AI hallucinations"
```

Focuses specifically on reference validation and consistency checks.

## Integration Examples

### With Claude Desktop

1. Configure MCP server in settings
2. Start coding conversation
3. Ask: "Review this code for hallucinations"
4. CodeGuardian analyzes and reports issues

### With Cursor

1. Add CodeGuardian to MCP servers
2. Generate code with AI
3. Use CodeGuardian tools to validate
4. Iterate based on feedback

### With VS Code + Continue

1. Configure Continue to use CodeGuardian MCP
2. Generate code snippets
3. Validate with CodeGuardian
4. Apply fixes
