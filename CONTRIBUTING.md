# Contributing to CodeGuardian MCP

Welcome to the CodeGuardian MCP project! We're thrilled that you're considering contributing. This document will guide you through the process of contributing to our MCP server that validates AI-generated code against actual codebases.

<p align="center">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge" alt="PRs Welcome">
  <img src="https://img.shields.io/badge/first--timers--friendly-blue.svg?style=for-the-badge" alt="First Timers Friendly">
</p>

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Release Process](#release-process)
- [Questions and Help](#questions-and-help)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. We expect all contributors to:

- Be respectful and constructive in all interactions
- Welcome newcomers and help them learn
- Focus on what is best for the community and the project
- Show empathy towards others
- Accept constructive criticism gracefully

Harassment, trolling, or any form of discriminatory behavior will not be tolerated.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20 or higher ([Download here](https://nodejs.org/))
- **pnpm**: Package manager ([Install here](https://pnpm.io/installation))

Verify your installations:

```bash
node --version  # Should be v20.x.x or higher
pnpm --version  # Should be 8.x.x or higher
```

### Fork and Clone

1. **Fork the repository** on GitHub by clicking the "Fork" button
2. **Clone your fork** locally:

```bash
git clone https://github.com/YOUR_USERNAME/codeguardian_mcp.git
cd codeguardian_mcp
```

3. **Add the upstream remote**:

```bash
git remote add upstream https://github.com/original-owner/codeguardian_mcp.git
```

### Installation

Install all dependencies using pnpm:

```bash
pnpm install
```

### Build

Compile the TypeScript source code:

```bash
pnpm run build
```

Or use the watch mode for development:

```bash
pnpm run dev
```

---

## Development Workflow

### Branch Naming Conventions

We use the following branch naming conventions:

- `feature/description` - New features (e.g., `feature/add-python-validation`)
- `bugfix/description` - Bug fixes (e.g., `bugfix/fix-ast-parser`)
- `docs/description` - Documentation updates (e.g., `docs/update-readme`)
- `refactor/description` - Code refactoring (e.g., `refactor/simplify-analyzer`)
- `test/description` - Test additions or updates (e.g., `test/add-unit-tests`)

### Making Changes

1. **Create a new branch** from `main`:

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes** following our [Coding Standards](#coding-standards)

3. **Write or update tests** as needed

4. **Run the test suite** to ensure nothing is broken:

```bash
pnpm test
```

5. **Build the project** to verify compilation:

```bash
pnpm run build
```

6. **Commit your changes** following our [Commit Message Guidelines](#commit-message-guidelines)

### Running Tests

Run all tests:

```bash
pnpm test
```

Run tests in watch mode during development:

```bash
pnpm test:watch
```

Run tests with coverage:

```bash
pnpm test:coverage
```

### Linting

We use ESLint and Prettier for code quality. Run linting:

```bash
pnpm run lint
```

Fix linting issues automatically:

```bash
pnpm run lint:fix
```

### Building

Compile TypeScript to JavaScript:

```bash
pnpm run build
```

Clean and rebuild:

```bash
pnpm run clean && pnpm run build
```

---

## Project Structure

Understanding the project structure will help you navigate the codebase:

```
codeguardian_mcp/
├── src/                      # Main source code
│   ├── index.ts             # Entry point
│   ├── server.ts            # MCP server setup
│   ├── tools/               # Validation tools
│   │   ├── validate.ts      # Main validation tool
│   │   ├── dependencyGraph.ts
│   │   └── contextBuilder.ts
│   ├── analyzers/           # Code analysis modules
│   │   ├── astAnalyzer.ts   # AST parsing and analysis
│   │   ├── symbolResolver.ts
│   │   └── typeChecker.ts
│   ├── context/             # Context building
│   │   ├── projectContext.ts
│   │   └── symbolIndex.ts
│   ├── prompts/             # Validation prompts
│   │   ├── validate.ts
│   │   ├── validateDetailed.ts
│   │   └── validateWithExamples.ts
│   └── utils/               # Utility functions
│       ├── fileUtils.ts
│       └── logger.ts
├── tests/                   # Test files
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── fixtures/           # Test fixtures
├── docs/                    # Documentation
│   ├── api.md
│   └── guides/
├── dist/                    # Compiled output (generated)
├── package.json
├── tsconfig.json
└── jest.config.js
```

### Key Directories

- **`src/tools/`** - MCP tool implementations that expose validation functionality
- **`src/analyzers/`** - Core analysis logic for AST parsing, symbol resolution, and type checking
- **`src/context/`** - Project context building and symbol indexing
- **`src/prompts/`** - Validation prompt templates following prompt engineering best practices
- **`tests/`** - Comprehensive test suite with unit and integration tests
- **`docs/`** - Additional documentation beyond the README

---

## How to Contribute

### Reporting Bugs

Before reporting a bug, please:

1. Check if the issue already exists in the [Issues](https://github.com/original-owner/codeguardian_mcp/issues)
2. Try to reproduce the issue with the latest version

When reporting a bug, please include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Code samples** or minimal reproduction cases
- **Environment details** (Node.js version, OS, etc.)
- **Error messages** and stack traces

Use the bug report template when creating an issue.

### Suggesting Features

We welcome feature suggestions! When proposing a new feature:

1. **Check existing issues** to avoid duplicates
2. **Describe the use case** clearly
3. **Explain the benefits** to users
4. **Consider implementation complexity**
5. **Be open to discussion** and feedback

### Pull Request Process

1. **Ensure your code meets our standards**:
   - All tests pass
   - Code is linted
   - TypeScript compiles without errors
   - New features include tests

2. **Update documentation** if needed (README, inline comments, etc.)

3. **Create a Pull Request** with:
   - Clear title describing the change
   - Detailed description of what changed and why
   - Reference to any related issues (e.g., "Fixes #123")
   - Screenshots or examples if applicable

4. **Wait for review** - maintainers will review your PR and may request changes

5. **Address feedback** and push updates to your branch

6. **Merge** - once approved, a maintainer will merge your PR

### Code Review Process

All contributions go through code review to ensure quality:

- Reviews typically happen within 48-72 hours
- Reviewers will check for:
  - Code correctness and efficiency
  - Test coverage
  - Documentation completeness
  - Adherence to coding standards
- Be responsive to feedback and willing to make changes
- Reviews are collaborative - feel free to discuss suggestions

---

## Coding Standards

### TypeScript Conventions

We follow these TypeScript conventions:

- **Use strict mode** - Enable all strict TypeScript compiler options
- **Explicit types** - Prefer explicit type annotations for function parameters and return types
- **Interfaces over types** - Use `interface` for object shapes, `type` for unions/aliases
- **Consistent naming**:
  - PascalCase for classes, interfaces, enums, types
  - camelCase for variables, functions, methods
  - UPPER_SNAKE_CASE for constants
  - Descriptive names that explain purpose

```typescript
// Good
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

function validateCode(code: string): ValidationResult {
  // implementation
}

// Avoid
function validate(c: string): any {
  // implementation
}
```

- **Avoid `any`** - Use `unknown` when type is truly unknown, proper types otherwise
- **Null safety** - Use optional chaining (`?.`) and nullish coalescing (`??`)
- **Async/await** - Prefer async/await over raw promises

### Testing Requirements

- **Write tests for all new features** and bug fixes
- **Aim for high coverage** - especially for critical validation logic
- **Test edge cases** and error conditions
- **Use descriptive test names** that explain what is being tested
- **Follow AAA pattern**: Arrange, Act, Assert

```typescript
describe('validateCode', () => {
  it('should return valid result for correct TypeScript code', () => {
    // Arrange
    const code = 'const x: number = 5;';
    
    // Act
    const result = validateCode(code);
    
    // Assert
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
```

### Documentation Requirements

- **JSDoc comments** for all public functions, classes, and interfaces
- **Inline comments** for complex logic (explain "why", not "what")
- **README updates** for user-facing changes
- **Type documentation** for exported types

```typescript
/**
 * Validates AI-generated code against the actual codebase.
 * 
 * @param projectPath - Path to the project root directory
 * @param newCode - The AI-generated code to validate
 * @param language - Programming language of the code
 * @returns Validation result with score and detected hallucinations
 * @throws {ValidationError} If the project path is invalid
 * 
 * @example
 * ```typescript
 * const result = await validateCode({
 *   projectPath: './my-project',
 *   newCode: 'const user = getUserById(id);',
 *   language: 'typescript'
 * });
 * ```
 */
export async function validateCode(
  projectPath: string,
  newCode: string,
  language: SupportedLanguage
): Promise<ValidationResult> {
  // implementation
}
```

---

## Testing Guidelines

### How to Write Tests

We use **Jest** for testing. Tests are located in the `tests/` directory.

**Test File Structure:**

```
tests/
├── unit/                    # Unit tests (test individual functions/modules)
│   ├── analyzers/
│   │   └── astAnalyzer.test.ts
│   └── tools/
│       └── validate.test.ts
├── integration/             # Integration tests (test multiple modules together)
│   └── validation-flow.test.ts
└── fixtures/               # Test data and sample files
    ├── sample-project/
    └── invalid-code/
```

**Writing Unit Tests:**

```typescript
import { validateCode } from '../../src/tools/validate';

describe('validateCode', () => {
  describe('TypeScript validation', () => {
    it('should detect non-existent function calls', async () => {
      const result = await validateCode({
        projectPath: './fixtures/sample-project',
        newCode: 'getUserById(123);',
        language: 'typescript'
      });
      
      expect(result.hallucinationDetected).toBe(true);
      expect(result.hallucinations).toContainEqual(
        expect.objectContaining({
          type: 'nonExistentFunction',
          message: expect.stringContaining('getUserById')
        })
      );
    });
  });
});
```

**Test Data:**

Use fixtures for test data:

```typescript
// tests/fixtures/sample-project/user.ts
export function findUserById(id: number) {
  // implementation
}
```

### Running Test Suites

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test src/tools/validate.test.ts

# Run tests matching pattern
pnpm test -- --testNamePattern="validation"

# Run with coverage
pnpm test:coverage

# Debug tests
pnpm test:debug
```

### Test Coverage Expectations

We aim for high test coverage, especially for:

- **Core validation logic**: 90%+ coverage
- **AST analyzers**: 85%+ coverage
- **Tool implementations**: 80%+ coverage
- **Utility functions**: 75%+ coverage

View coverage report:

```bash
pnpm test:coverage
# Open coverage/lcov-report/index.html in browser
```

---

## Commit Message Guidelines

We follow **Conventional Commits** specification for clear and automated changelog generation.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons, etc.)
- **refactor**: Code refactoring without functionality changes
- **test**: Adding or updating tests
- **chore**: Build process, dependencies, etc.

### Examples

```
feat(validation): add Python language support

Implement AST parsing and symbol resolution for Python files.
Includes support for imports, function calls, and class references.

Closes #45
```

```
fix(analyzer): resolve false positive for method chaining

Fixed issue where chained method calls were incorrectly flagged
as hallucinations when the object type was inferred.

Fixes #78
```

```
docs(readme): update installation instructions

Added pnpm installation steps and Node.js version requirements.
```

```
test(validate): add tests for edge cases in symbol resolution

Added tests for:
- Namespaced imports
- Type aliases
- Generic type parameters
```

### Best Practices

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit first line to 72 characters
- Reference issues and PRs in the footer
- Be descriptive but concise

---

## Release Process

We use **Semantic Versioning** (SemVer) for releases:

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. **Update version** in `package.json`

2. **Update CHANGELOG.md** with changes since last release

3. **Create a release commit**:

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): bump version to 1.2.0"
```

4. **Create a git tag**:

```bash
git tag -a v1.2.0 -m "Release version 1.2.0"
```

5. **Push to remote**:

```bash
git push origin main --tags
```

6. **Create GitHub Release** with release notes

### Pre-releases

For beta/alpha versions:

```
1.0.0-alpha.1
1.0.0-beta.2
```

---

## Questions and Help

### Getting Help

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check the `docs/` directory and README.md

### Before Asking

1. Check existing issues and discussions
2. Review the documentation
3. Search closed issues for similar problems
4. Provide context when asking questions

### Communication Channels

- **Issues**: Technical problems, bugs, feature requests
- **Discussions**: Ideas, questions, show and tell
- **Pull Requests**: Code contributions and reviews

---

## Recognition

Contributors will be recognized in our README.md file and release notes. Thank you for helping make CodeGuardian MCP better!

---

## License

By contributing to CodeGuardian MCP, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

**Thank you for contributing!** 🎉

Your efforts help improve code validation for AI-generated code, making development safer and more reliable for everyone.
