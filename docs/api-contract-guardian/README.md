# API Contract Guardian - README

## What is API Contract Guardian?

API Contract Guardian is a CodeGuardian feature that validates API contracts between frontend and backend in real-time. It catches mismatches before they cause runtime errors.

## Quick Start

### Installation

```bash
# CodeGuardian is already installed
# API Contract Guardian is included
```

### Usage

```bash
# Start the guardian (auto-detects projects)
npx codeguardian start

# Or with explicit configuration
npx codeguardian start --config .codeguardian.json
```

### Zero Configuration

API Contract Guardian works out of the box:
1. Place your frontend in `./frontend` (or root)
2. Place your backend in `./backend` (optional)
3. Run `codeguardian start`
4. Start coding - mismatches are caught immediately!

## Example

### The Problem

You're coding with AI and it generates:

**Backend (FastAPI)**:
```python
@app.post("/api/clients")
def create_client(data: ClientCreate):
    # expects: { "name": str, "email": str, "user_id": str }
    ...
```

**Frontend (Next.js)**:
```typescript
// AI generates this:
const response = await api.post('/api/clients', {
  userId: "123",  // ❌ Wrong! Should be user_id
  name: "John"
  // ❌ Missing email!
});
```

### The Solution

API Contract Guardian immediately reports:

```
❌ API Contract Mismatch Detected

File: frontend/src/services/clients.ts:45
Endpoint: POST /api/clients

Issues Found:
1. Parameter name mismatch:
   Frontend sends: { userId: string }
   Backend expects: { user_id: string }
   Suggestion: Rename 'userId' to 'user_id' to match backend

2. Missing required field:
   Backend requires: 'email' (string)
   Frontend missing: 'email'
   Suggestion: Add 'email' field to request
```

## Features

### ✅ Auto-Detection
- Detects project structure automatically
- Supports monorepo and separate repos
- Works with popular frameworks

### ✅ Real-Time Validation
- Validates on every file save
- Checks endpoint existence
- Validates HTTP methods
- Compares request/response schemas

### ✅ Smart Error Messages
- Clear explanations
- Specific suggestions
- Line numbers and file paths
- Severity levels

### ✅ Framework Agnostic
**Frontend**: Next.js, React, Vue, Angular, Svelte
**Backend**: FastAPI, Flask, Express, Django, NestJS
**API Styles**: REST, GraphQL, tRPC

## Configuration

### Default (Zero Config)

No configuration needed! Guardian auto-detects:
- Frontend frameworks from `package.json`
- Backend frameworks from `requirements.txt` or `pyproject.toml`
- API patterns from code structure

### Explicit Configuration

Create `.codeguardian.json`:

```json
{
  "apiContract": {
    "enabled": true,
    "projects": {
      "frontend": {
        "path": "./frontend",
        "framework": "nextjs"
      },
      "backend": {
        "path": "./backend",
        "framework": "fastapi"
      }
    },
    "validation": {
      "endpoint": true,
      "parameters": true,
      "types": true,
      "strict": false
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable API contract validation |
| `autoDetect` | boolean | `true` | Auto-detect project structure |
| `validation.endpoint` | boolean | `true` | Validate endpoint existence |
| `validation.parameters` | boolean | `true` | Validate parameter names |
| `validation.types` | boolean | `true` | Validate type compatibility |
| `validation.strict` | boolean | `false` | Strict mode (more warnings) |

## Validation Types

### 1. Endpoint Validation

Checks if the endpoint exists and HTTP method matches.

```
❌ Endpoint Not Found
Frontend calls: POST /api/clients
Backend has: No matching route
Suggestion: Check if route exists or update frontend URL
```

### 2. Method Validation

Checks if HTTP method matches.

```
❌ HTTP Method Mismatch
Frontend uses: POST /api/clients
Backend expects: GET /api/clients
Suggestion: Change frontend to use GET
```

### 3. Parameter Validation

Checks parameter names and required fields.

```
❌ Parameter Name Mismatch
Frontend sends: { userId: string }
Backend expects: { user_id: string }
Suggestion: Rename 'userId' to 'user_id'
```

### 4. Type Validation

Checks type compatibility between TypeScript and Python.

```
⚠️ Type Mismatch
Frontend type: string
Backend type: int
Suggestion: Ensure types are compatible
```

## Supported Patterns

### Frontend Patterns

**Service Layer** (Recommended):
```typescript
// src/services/clients.ts
export async function createClient(data: ClientCreate) {
  return api.post('/api/clients', data);
}
```

**Direct Fetch**:
```typescript
const response = await fetch('/api/clients', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

**Axios**:
```typescript
const response = await axios.post('/api/clients', data);
```

### Backend Patterns

**FastAPI** (Recommended):
```python
@app.post("/api/clients")
def create_client(data: ClientCreate) -> Client:
    ...
```

**Flask**:
```python
@app.route("/api/clients", methods=["POST"])
def create_client():
    data = request.json
    ...
```

**Express**:
```javascript
app.post('/api/clients', (req, res) => {
  const data = req.body;
  ...
});
```

## Project Structure

### Monorepo
```
my-project/
├── frontend/          # Next.js app
│   ├── src/
│   │   └── services/
│   └── package.json
├── backend/           # FastAPI app
│   ├── app/
│   │   └── routes/
│   └── requirements.txt
└── .codeguardian.json
```

### Separate Repos
```
# Frontend repo
frontend/
├── src/
│   └── services/
└── package.json

# Backend repo  
backend/
├── app/
│   └── routes/
└── requirements.txt
```

Guardian auto-links them if they're in the same parent directory.

## Troubleshooting

### Guardian not detecting my backend

**Problem**: Guardian only sees frontend

**Solution**:
1. Ensure backend folder exists (`./backend` or `../backend`)
2. Check for `requirements.txt` or `pyproject.toml`
3. Add explicit configuration:
```json
{
  "apiContract": {
    "projects": {
      "backend": {
        "path": "./api",
        "framework": "fastapi"
      }
    }
  }
}
```

### False positives

**Problem**: Getting warnings for valid code

**Solution**:
- Disable strict mode: `"strict": false`
- Disable specific validations:
```json
{
  "apiContract": {
    "validation": {
      "types": false  // Disable type checking
    }
  }
}
```

### Missing validations

**Problem**: Not catching all mismatches

**Solution**:
- Enable strict mode: `"strict": true`
- Ensure backend code is accessible
- Check that types/interfaces are exported

## Advanced Usage

### Custom Type Mappings

Map TypeScript types to Python types:

```json
{
  "apiContract": {
    "typeMappings": {
      "UserId": "str",
      "DateTime": "datetime"
    }
  }
}
```

### Ignore Patterns

Exclude files from validation:

```json
{
  "apiContract": {
    "ignore": [
      "**/test/**",
      "**/*.test.ts",
      "**/mocks/**"
    ]
  }
}
```

### Multiple Backends

Support microservices:

```json
{
  "apiContract": {
    "projects": {
      "frontend": { "path": "./frontend" },
      "auth-service": { "path": "./services/auth" },
      "payment-service": { "path": "./services/payment" }
    }
  }
}
```

## Best Practices

### 1. Keep Types in Sync

Export types from backend and import in frontend:

```typescript
// types.ts - Shared between frontend and backend
export interface Client {
  id: string;
  name: string;
  email: string;
}
```

### 2. Use Consistent Naming

Choose one convention:
- **snake_case** for both frontend and backend
- **camelCase** for frontend, snake_case for backend (Guardian handles conversion)

### 3. Validate Early

Run guardian in CI/CD:

```yaml
# .github/workflows/validate.yml
- name: Validate API Contracts
  run: npx codeguardian validate --strict
```

### 4. Document Changes

When changing APIs:
1. Update backend first
2. Guardian will show frontend issues
3. Update frontend to match
4. Commit both together

## FAQ

**Q: Does it work with GraphQL?**
A: Yes! Guardian validates GraphQL schemas and queries.

**Q: Can it generate types automatically?**
A: Coming in v2.0 - auto-generate TypeScript from Pydantic models.

**Q: Does it support tRPC?**
A: Yes, tRPC contracts are fully supported.

**Q: What about WebSockets?**
A: WebSocket event validation is supported for Socket.io and native WS.

**Q: Can I use it with existing projects?**
A: Absolutely! Zero config needed - just run `codeguardian start`.

## Contributing

See [Contributing Guide](./CONTRIBUTING.md)

## License

MIT License - see [LICENSE](../LICENSE)

## Support

- 📖 [Documentation](./docs)
- 🐛 [Issue Tracker](https://github.com/yourusername/codeguardian/issues)
- 💬 [Discord](https://discord.gg/codeguardian)

---

**Happy Vibecoding! 🚀**
