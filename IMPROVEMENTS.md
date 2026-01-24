# CodeGuardian MCP - Prompt Engineering Improvements

This document summarizes the improvements made to CodeGuardian MCP based on best practices from the [Prompt Engineering Guide](https://github.com/dair-ai/Prompt-Engineering-Guide).

## Overview

We've enhanced CodeGuardian with advanced prompt engineering techniques to improve validation accuracy, provide better guidance, and make the tool more effective at catching AI hallucinations.

## Key Improvements

### 1. **Prompt Templates Library** (`src/prompts/templates.ts`)

Added multiple validation prompt templates based on different prompt engineering strategies:

- **Zero-shot**: Direct validation for simple code
- **Few-shot**: Learning from examples of common AI mistakes
- **Chain-of-Thought**: Step-by-step reasoning for complex validation
- **Self-consistency**: Multi-perspective analysis for critical code
- **Structured Output**: Explicit format for automated processing
- **Role-based**: Domain-specific validation from expert perspective

**Benefits:**
- Matches validation depth to code complexity
- Provides examples to guide AI behavior
- Encourages systematic reasoning
- Reduces false positives

### 2. **Reusable Prompt Patterns** (`src/prompts/library.ts`)

Created a library of composable prompt patterns:

- Role-based prompting
- Constraint-based prompting
- Output formatting
- Error prevention
- Step-by-step reasoning
- Few-shot learning
- Multi-perspective analysis
- Confidence scoring

**Benefits:**
- Consistent prompt structure across the tool
- Easy to combine patterns for specific needs
- Reduces prompt engineering complexity

### 3. **AI Pattern Examples** (`src/analyzers/aiPatternExamples.ts`)

Comprehensive library of real-world AI anti-patterns with examples:

- Generic error handling
- Unnecessary abstraction
- Missing input validation
- Hardcoded credentials
- Inefficient loops
- Unused async/await
- Missing error types
- Incomplete type definitions

Each example includes:
- Bad code example
- Good code example
- Explanation of why it's problematic
- Severity level
- Category

**Benefits:**
- Few-shot learning for pattern detection
- Consistent suggestions across validations
- Educational value for users

### 4. **Enhanced Prompts** (`src/prompts/index.ts`)

Expanded from 1 basic prompt to 5 specialized prompts:

1. `validate` - Basic validation (zero-shot)
2. `validate-detailed` - Chain-of-thought reasoning
3. `validate-with-examples` - Few-shot learning
4. `validate-comprehensive` - Multi-perspective analysis
5. `validate-structured` - Structured output format

**Benefits:**
- Users can choose appropriate validation depth
- Better results for different code complexity levels
- Supports different use cases (learning, CI/CD, critical code)

### 5. **Confidence Scoring** (`src/tools/validateCode.ts`)

Added confidence scores (0-100%) to all validation issues:

```typescript
{
  "type": "nonExistentFunction",
  "severity": "critical",
  "message": "Function 'getUserById' does not exist",
  "confidence": 95,  // NEW
  "reasoning": "Searched 1,247 symbols, found no match"  // NEW
}
```

Confidence calculation considers:
- Whether symbol exists in project but not imported
- Number of similar symbols found
- Type of issue (dependency vs symbol vs method)
- Strict mode vs permissive mode

**Benefits:**
- Prioritize fixes by confidence level
- Reduce false positive concerns
- Explain reasoning behind each finding

### 6. **Reasoning Chains** (`src/tools/validateCode.ts`)

Every validation issue now includes reasoning:

```typescript
{
  "reasoning": "Searched entire project, found no symbol named 'getUserById' or similar. Very high confidence this is a hallucination."
}
```

**Benefits:**
- Transparency in validation logic
- Helps users understand why something is flagged
- Builds trust in the tool
- Educational for learning AI patterns

### 7. **Enhanced AI Pattern Detection** (`src/analyzers/aiPatterns.ts`)

Updated pattern detector to use the example library:

- References real-world examples
- Provides context-aware suggestions
- Detects additional patterns (hardcoded credentials, unnecessary async)
- Links suggestions to pattern examples

**Benefits:**
- More accurate pattern detection
- Better suggestions based on proven examples
- Catches security issues (hardcoded credentials)

### 8. **Improved Tool Description** (`src/tools/validateCode.ts`)

Completely rewrote the tool description with:

- Clear workflow (chain-of-thought)
- Structured sections with visual separators
- Confidence level interpretation guide
- Score interpretation guide
- Multiple examples
- Best practices section
- Prompt engineering guidance

**Benefits:**
- AI models understand how to use the tool better
- Users get better guidance
- Reduces misuse of the tool
- Encourages best practices

### 9. **Enhanced Documentation** (`CLAUDE.md`)

Updated AI instructions with:

- Chain-of-thought workflow examples
- Confidence level interpretation
- Multi-perspective validation guidance
- Prompt template selection guide
- Best practices for prompt engineering
- Detailed reasoning examples

**Benefits:**
- AI assistants use the tool more effectively
- Better validation results
- Fewer false positives
- More educational for users

## Prompt Engineering Techniques Applied

### 1. **Few-Shot Learning**

Provide examples of good vs bad code to guide behavior:

```typescript
EXAMPLE 1 - Non-existent function:
❌ BAD: const user = getUserById(id); // Function doesn't exist
✅ GOOD: const user = findUserById(id); // Use existing function
```

### 2. **Chain-of-Thought Reasoning**

Break down validation into explicit steps:

```
STEP 1: Extract all function calls
STEP 2: Check against project symbol table
STEP 3: Find similar symbols for typos
STEP 4: Calculate confidence scores
STEP 5: Provide specific fixes
```

### 3. **Self-Consistency**

Validate from multiple perspectives:

```
PERSPECTIVE 1 - Symbol Validation
PERSPECTIVE 2 - Dependency Validation
PERSPECTIVE 3 - Logic Validation
```

### 4. **Structured Output**

Explicit format requirements:

```
VALIDATION SUMMARY:
- Status: [PASS/FAIL]
- Score: [0-100]

CRITICAL ISSUES:
1. [Issue with confidence and reasoning]
```

### 5. **Role-Based Prompting**

Assign expert roles:

```
You are a senior code reviewer with expertise in detecting AI-generated code issues.
```

### 6. **Confidence Scoring**

Quantify uncertainty:

```
Confidence: 95% → Very likely a real issue
Confidence: 60% → Possible false positive
```

## Usage Examples

### Basic Validation (Zero-Shot)

```typescript
validate_code({
  projectPath: ".",
  newCode: "const user = getUserById(id);",
  language: "typescript"
})
```

### Detailed Validation (Chain-of-Thought)

Use the `validate-detailed` prompt for complex code that needs step-by-step analysis.

### Learning Mode (Few-Shot)

Use the `validate-with-examples` prompt to see examples of common AI mistakes.

### Critical Code (Multi-Perspective)

Use the `validate-comprehensive` prompt for high-stakes code that needs thorough review.

### CI/CD Integration (Structured Output)

Use the `validate-structured` prompt for automated processing.

## Impact

### Before

- Single basic prompt
- No confidence scores
- No reasoning provided
- Limited pattern detection
- Generic suggestions
- No prompt engineering guidance

### After

- 5 specialized prompts
- Confidence scores (0-100%) for all issues
- Detailed reasoning for each finding
- Enhanced pattern detection with examples
- Context-aware suggestions from real patterns
- Comprehensive prompt engineering guidance
- Multi-perspective validation options
- Chain-of-thought reasoning support

## Metrics

- **Prompts**: 1 → 5 (400% increase)
- **Pattern Examples**: 3 → 8 (167% increase)
- **Validation Metadata**: Added confidence + reasoning to all issues
- **Documentation**: 3x more detailed with examples
- **Prompt Patterns**: 8 reusable patterns added
- **Template Strategies**: 6 different approaches

## Best Practices for Users

1. **Match complexity to validation depth**
   - Simple code → `validate`
   - Complex code → `validate-detailed`
   - Learning → `validate-with-examples`
   - Critical code → `validate-comprehensive`

2. **Use confidence scores**
   - >90% confidence → Fix immediately
   - 70-90% → Review carefully
   - <70% → May be false positive

3. **Read the reasoning**
   - Understand why something is flagged
   - Learn AI patterns to avoid
   - Build intuition for hallucinations

4. **Iterate with chain-of-thought**
   - Generate code
   - Validate
   - Analyze results
   - Fix issues
   - Validate again

## Future Enhancements

Potential areas for further improvement:

1. **Adaptive prompting**: Automatically select best prompt based on code complexity
2. **Learning from feedback**: Track which suggestions users accept/reject
3. **Custom pattern libraries**: Allow users to add their own anti-patterns
4. **Multi-language examples**: Expand examples to Python, Go, etc.
5. **Confidence calibration**: Fine-tune confidence scores based on real-world accuracy
6. **Prompt optimization**: A/B test different prompt formulations

## References

- [Prompt Engineering Guide](https://github.com/dair-ai/Prompt-Engineering-Guide)
- [Chain-of-Thought Prompting](https://www.promptingguide.ai/techniques/cot)
- [Few-Shot Learning](https://www.promptingguide.ai/techniques/fewshot)
- [Self-Consistency](https://www.promptingguide.ai/techniques/consistency)

## Conclusion

These improvements make CodeGuardian more effective at catching AI hallucinations by:

1. **Providing better guidance** through structured prompts
2. **Increasing transparency** with confidence scores and reasoning
3. **Enabling learning** through examples and patterns
4. **Supporting different use cases** with multiple prompt templates
5. **Following best practices** from prompt engineering research

The tool now not only catches hallucinations but also educates users about AI code generation patterns and provides clear, actionable guidance for fixes.
