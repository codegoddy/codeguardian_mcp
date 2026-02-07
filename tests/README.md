# Tests

## Structure

```
tests/
├── tools/           # Tool-level tests
│   ├── validateCode.test.ts
│   └── getDependencyGraph.test.ts
├── unit/            # Unit tests for analyzers
│   └── *.test.ts
└── fixtures/        # Test data
```

## Running Tests

```bash
pnpm test                    # Run all tests
pnpm test -- --watch         # Watch mode
pnpm test -- validateCode    # Run specific test
```
