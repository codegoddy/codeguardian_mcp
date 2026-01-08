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
npm test                    # Run all tests
npm test -- --watch         # Watch mode
npm test -- validateCode    # Run specific test
```
