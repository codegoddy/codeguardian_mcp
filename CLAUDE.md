# CodeGuardian MCP - AI Instructions

You have access to CodeGuardian, an advanced code validation tool that catches hallucinations in AI-generated code using AST parsing and prompt engineering best practices.

## CRITICAL RULE

**ALWAYS call `validate_code` AFTER generating any code, BEFORE presenting it to the user.**

This is non-negotiable. AI-generated code frequently references functions, classes, or methods that don't exist in the user's project. These "hallucinations" compile fine but crash at runtime.

## Enhanced Workflow (Chain-of-Thought)

```
1. User asks for code
2. You generate code
3. THINK: "I need to validate this against the actual codebase"
4. Call validate_code({ projectPath: ".", newCode: "<your code>", language: "typescript" })
5. ANALYZE: Review the validation results
   - Score < 70? Critical issues exist
   - Hallucinations found? Must fix before presenting
   - Suggestions provided? Use them to correct the code
6. If issues found → Fix them using the suggestions → Validate again
7. Present validated code to user with confidence
```

## Validation Confidence Levels

When you receive validation results, interpret them as follows:

- **Score 90-100**: ✅ High confidence - Code is safe to use
- **Score 70-89**: ⚠️ Medium confidence - Minor issues, review suggestions
- **Score 50-69**: 🔴 Low confidence - Multiple issues, fix before using
- **Score < 50**: ❌ Critical - Do not use, major hallucinations detected

## Available Prompts (Use These for Better Results)

CodeGuardian provides multiple prompt templates based on prompt engineering best practices:

### 1. `validate` - Basic validation (Zero-shot)
Quick check for hallucinations. Use for simple code snippets.

### 2. `validate-detailed` - Chain-of-thought reasoning
Step-by-step validation with detailed reasoning. Use for complex code.

### 3. `validate-with-examples` - Few-shot learning
Validation with examples of common AI mistakes. Use when learning patterns.

### 4. `validate-comprehensive` - Multi-perspective analysis
Validates from multiple angles (symbols, dependencies, logic). Use for critical code.

### 5. `validate-structured` - Structured output
Explicit format for automated processing. Use for CI/CD integration.

## When to Use Each Tool

### `validate_code` - Use EVERY TIME you generate code

**Default mode (recommended):** Catches likely hallucinations without excessive noise
```typescript
validate_code({
  projectPath: ".",
  newCode: "const user = getUserById(id);",
  language: "typescript"
  // strictMode defaults to false - DO NOT set it unless user explicitly asks
})
```

**Strict mode (ONLY when user explicitly requests it):** Flags all unresolved symbols including edge cases, but increases false positives
```typescript
// Only use this if the user specifically says "run with strict mode" or "strict validation"
validate_code({
  projectPath: ".",
  newCode: "...",
  language: "typescript",
  strictMode: true
})
```

**Dead code detection:**
```typescript
validate_code({
  projectPath: "src/components",
  language: "typescript",
  checkDeadCode: true
})
```

**Interpreting Results:**
- `hallucinationDetected: true` → DO NOT present code, fix issues first
- `score < 70` → Multiple issues, review carefully
- `recommendation.verdict: "REJECT"` → Critical issues, must fix
- `confidence` field → How certain we are about each issue (0-100%)

### `get_dependency_graph` - Use when modifying existing files

Before changing a file, check what depends on it:

```typescript
get_dependency_graph({
  target: "src/utils/auth.ts",
  language: "typescript"
})
```

### `build_context` - Use after major project changes

Force rebuild the project index:

```typescript
build_context({
  projectPath: ".",
  forceRebuild: true
})
```

## Example: Correct Workflow (Chain-of-Thought)

**User:** "Add a function to get user by email"

**You (internal reasoning):**
```
STEP 1: Generate initial code
→ Created function using getUserById()

STEP 2: Validate against codebase
→ Call validate_code with generated code

STEP 3: Analyze results
→ Score: 45/100 (CRITICAL)
→ Hallucination detected: getUserById doesn't exist
→ Suggestion: Use findUserById instead
→ Confidence: 95%

STEP 4: Fix the issue
→ Replace getUserById with findUserById

STEP 5: Validate again
→ Score: 100/100 (PASS)
→ No hallucinations detected

STEP 6: Present to user
```

**You (to user):** "Here's the function. I validated it against your codebase - it uses your existing `findUserById` helper instead of the non-existent `getUserById`."

## What Hallucinations Look Like (With Reasoning)

```json
{
  "hallucinationDetected": true,
  "score": 45,
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

**How to interpret:**
- `confidence: 95` → Very certain this is an issue
- `reasoning` → Explains WHY it's flagged
- `suggestion` → Provides alternatives from actual codebase
- `verdict: "REJECT"` → Do not use this code

## Best Practices (Prompt Engineering)

### 1. Use Chain-of-Thought Reasoning
Think through validation step-by-step:
```
"Let me validate this code:
1. Extract all function calls → [getUserById, saveUser]
2. Check against project → getUserById not found
3. Find alternatives → findUserById exists
4. Fix and re-validate → Now passes"
```

### 2. Learn from Examples (Few-Shot)
Reference common patterns:
```
"This is similar to Example 2 in the validation guide:
❌ BAD: import { Button } from 'ui-lib'; // Not installed
✅ GOOD: import { Button } from './components/Button';
I'll check if the package exists first."
```

### 3. Use Confidence Scoring
Interpret confidence levels:
```
"Confidence: 95% → Very likely a real issue, fix immediately
Confidence: 60% → Possible false positive, verify manually
Confidence: 30% → Low confidence, may be edge case"
```

### 4. Multi-Perspective Validation
For critical code, validate from multiple angles:
```
"Validating from three perspectives:
1. Symbol validation → All functions exist ✓
2. Dependency validation → All packages installed ✓
3. Logic validation → Parameter counts correct ✓
Overall: PASS"
```

### 5. Future Feature Detection (Intelligent Filtering)
CodeGuardian now intelligently detects **work-in-progress code** vs actual issues:

**Signals that indicate a future feature (not an error):**
- TODO/FIXME comments in the file
- Uncommitted changes (new or modified files)
- Feature branch naming (feature/*, wip/*, etc.)
- Stub implementations (throw "not implemented")
- Symbol names suggesting planned functionality (new*, upcoming*, planned*)

**Example:**
```typescript
// File: payment/newGateway.ts (uncommitted, on feature/payment-v2 branch)
// TODO: Implement Stripe integration
export async function newStripeGateway() {
  throw new Error("Not implemented yet");
}
```

This would be ** flagged as a future feature**, not dead code or a hallucination.

## Remember

- **Never skip validation** - even for "simple" code
- **Fix before presenting** - don't show hallucinated code to users
- **Use suggestions** - the tool tells you what actually exists
- **Validate again after fixes** - ensure your corrections are valid too
- **Explain your reasoning** - show users why the code is safe
- **Use appropriate prompt templates** - match complexity to validation depth
