# Contributing to CodeGuardian MCP

Thank you for your interest in contributing to CodeGuardian!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd codeguardian-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## Development Workflow

### Making Changes

1. Create a feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in the `src/` directory

3. Add tests in the `tests/` directory

4. Run tests to ensure everything passes
   ```bash
   npm test
   ```

5. Build to check for TypeScript errors
   ```bash
   npm run build
   ```

6. Lint your code
   ```bash
   npm run lint:fix
   ```

### Commit Guidelines

Use clear, descriptive commit messages:

```
feat: Add new AI pattern detection
fix: Resolve symbol table parsing issue
docs: Update README with examples
test: Add tests for reference validator
```

### Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add description of changes
4. Link any related issues

## Code Style

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write tests for new features

## Testing

- Write unit tests for all new functions
- Add integration tests for new tools
- Ensure test coverage stays above 80%
- Test edge cases and error conditions

## Questions?

Feel free to open an issue for any questions or discussions!
