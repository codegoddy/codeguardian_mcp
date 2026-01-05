# 🧪 Quick Test Reference

## Run Tests

```bash
# Main demo (recommended for presentations)
node tests/integration/test-hallucination-perfect.js

# React framework compatibility
node tests/integration/test-react-framework.js

# Python frameworks compatibility
node tests/integration/test-python-frameworks.js

# Simple class-based test
node tests/integration/test-hallucination-simple.js
```

## Expected Results

| Test | Time | Hallucinations | Status |
|------|------|----------------|--------|
| Perfect Demo | 2-5ms | 7 | ✅ Pass |
| React Framework | 3ms | 5 | ✅ Pass |
| Python Frameworks | 2ms | 7 | ✅ Pass |
| Simple Test | 4ms | 8 | ✅ Pass |

## Test Locations

```
tests/
└── integration/
    ├── test-hallucination-perfect.js    ⭐ Main demo
    ├── test-hallucination-simple.js     
    ├── test-react-framework.js          ⚛️ React
    └── test-python-frameworks.js        🐍 Python
```

## Documentation

- `tests/README.md` - Full test documentation
- `TESTS_ORGANIZED.md` - Organization summary
- `HALLUCINATION_TEST_RESULTS.md` - Test results
- `FRAMEWORK_SUPPORT.md` - Framework compatibility

---

**All tests passing ✅**
