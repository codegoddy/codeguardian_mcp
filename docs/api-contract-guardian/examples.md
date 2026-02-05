# API Contract Guardian - Usage Examples

## Basic Usage

### Example 1: Detecting Method Mismatch

**Backend (FastAPI)**:
```python
# backend/app/api/users.py
from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
async def list_users():
    return {"users": []}
```

**Frontend (TypeScript)**:
```typescript
// frontend/src/services/users.ts
export const usersApi = {
  // ❌ WRONG: Using POST instead of GET
  getUsers: () => ApiService.post('/api/users'),
}
```

**Guardian Output**:
```
❌ HTTP Method Mismatch
Frontend uses: POST /api/users
Backend expects: GET /api/users
File: frontend/src/services/users.ts:4
Suggestion: Change frontend to use GET
```

---

### Example 2: Path Parameter Mismatch

**Backend**:
```python
@router.get("/{user_id}")  # Note: user_id (snake_case)
async def get_user(user_id: str):
    pass
```

**Frontend**:
```typescript
// ❌ WRONG: Using camelCase in path
getUser: (userId: string) => 
  ApiService.get(`/api/users/${userId}`),
```

**Guardian Output**:
```
⚠️ Path Parameter Mismatch
Frontend path: /api/users/{param}
Backend path: /api/users/{user_id}
File: frontend/src/services/users.ts:5
Suggestion: Backend uses 'user_id' naming convention
```

---

### Example 3: Missing Required Field

**Backend (Pydantic Model)**:
```python
class UserCreate(BaseModel):
    name: str
    email: str  # Required field
    age: int
```

**Frontend (TypeScript Interface)**:
```typescript
interface UserCreate {
  name: string;
  // ❌ MISSING: email field
  age: number;
}
```

**Guardian Output**:
```
❌ Missing Required Field
Backend requires: 'email' (str)
Frontend missing: 'email'
File: frontend/src/types/users.ts:2
Suggestion: Add 'email: string' to UserCreate interface
```

---

### Example 4: Query Parameters

**Backend**:
```python
@router.get("/")
async def list_users(
    page: int = 1,
    limit: int = 10
):
    pass
```

**Frontend**:
```typescript
getUsers: async (page: number = 1, limit: number = 10) => {
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return ApiService.get(`/api/users${query}`);
}
```

**Guardian Output**:
```
✅ Matched Endpoint
Method: GET
Path: /api/users
Frontend: getUsers (users.ts)
Backend: list_users (users.py)
Match Score: 100%
```

---

### Example 5: Router Prefix Detection

**Backend main.py**:
```python
from app.api import users, posts

app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(posts.router, prefix="/api/posts", tags=["posts"])
```

**Backend users.py**:
```python
router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
async def get_users():  # Full path: /api/users/
    pass

@router.get("/{user_id}")
async def get_user(user_id: str):  # Full path: /api/users/{user_id}
    pass
```

**Backend posts.py**:
```python
router = APIRouter(tags=["posts"])

@router.get("/")  # Full path: /api/posts/
async def get_posts():
    pass
```

**Frontend**:
```typescript
usersApi: {
  getAll: () => ApiService.get('/api/users'),      // ✅ Matches /api/users/
  getById: (id) => ApiService.get(`/api/users/${id}`),  // ✅ Matches /api/users/{user_id}
},
postsApi: {
  getAll: () => ApiService.get('/api/posts'),      // ✅ Matches /api/posts/
}
```

---

## Advanced Examples

### Example 6: Nested Path Parameters

**Backend**:
```python
@router.get("/{user_id}/posts/{post_id}/comments/{comment_id}")
async def get_comment(user_id: str, post_id: str, comment_id: str):
    pass
```

**Frontend**:
```typescript
getComment: (userId: string, postId: string, commentId: string) =>
  ApiService.get(`/api/users/${userId}/posts/${postId}/comments/${commentId}`),
```

**Guardian Output**:
```
✅ Matched Endpoint
Method: GET
Path: /api/users/{param}/posts/{param}/comments/{param}
Frontend: getComment (comments.ts)
Backend: get_comment (comments.py)
Match Score: 100%
```

---

### Example 7: Empty String Routes

**Backend**:
```python
router = APIRouter(prefix="/api/integrations/google-calendar")

@router.delete("")  # Full path: /api/integrations/google-calendar
async def disconnect_google_calendar():
    pass
```

**Frontend**:
```typescript
disconnect: () => 
  ApiService.delete('/api/integrations/google-calendar'),
```

**Guardian Output**:
```
✅ Matched Endpoint
Method: DELETE
Path: /api/integrations/google-calendar
Frontend: disconnect (integrations.ts)
Backend: disconnect_google_calendar (google_calendar.py)
Match Score: 100%
```

---

### Example 8: Type Compatibility

**Backend**:
```python
from datetime import datetime
from decimal import Decimal

class Payment(BaseModel):
    amount: Decimal  # High precision decimal
    created_at: datetime
    status: Literal["pending", "completed", "failed"]
```

**Frontend**:
```typescript
interface Payment {
  amount: string;  // ✅ Compatible: string for Decimal
  created_at: string;  // ✅ Compatible: ISO string for datetime
  status: "pending" | "completed" | "failed";  // ✅ Compatible: literal union
}
```

**Guardian Output**:
```
✅ Type Compatibility Check
Payment.amount: string ↔ Decimal - Compatible
Payment.created_at: string ↔ datetime - Compatible
Payment.status: union ↔ Literal - Compatible
```

---

## Real-World Scenario

### Full Stack Application

**Project Structure**:
```
my-app/
├── frontend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── clients.ts
│   │   │   ├── projects.ts
│   │   │   └── auth.ts
│   │   └── types/
│   │       ├── client.ts
│   │       └── project.ts
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── clients.py
│   │   │   ├── projects.py
│   │   │   └── auth.py
│   │   └── main.py
│   └── requirements.txt
└── .codeguardian.json
```

**Guardian Report**:
```
🔗 API Contract Validation Report
================================================================================

📊 Summary:
  Total Issues: 2
    - Critical: 0 🔴
    - High: 1 🟠
    - Medium: 1 🟡

  Matched Endpoints: 24
  Matched Types: 8
  Unmatched Frontend: 1
  Unmatched Backend: 3

✅ Matched Endpoints (24):
  1. GET /api/clients - getClients
  2. POST /api/clients - createClient
  3. GET /api/clients/{param} - getClient
  4. PUT /api/clients/{param} - updateClient
  5. DELETE /api/clients/{param} - deleteClient
  ...

🟠 High Severity Issues:
  1. Missing required field 'email' in ClientCreate
     File: frontend/src/types/client.ts:5
     Suggestion: Add 'email: string' to match backend

🟡 Medium Severity Issues:
  1. Naming convention mismatch: 'userId' vs 'user_id'
     File: frontend/src/services/auth.ts:12
     Suggestion: Consider using snake_case for consistency

⚠️ Unmatched Frontend Services (1):
  1. GET /api/legacy/endpoint - getLegacyData
     (Backend route may have been removed)

⚠️ Unmatched Backend Routes (3):
  1. POST /api/webhooks/stripe - handle_stripe_webhook
  2. GET /api/admin/users - admin_list_users
  3. POST /api/internal/health - health_check
     (These are expected - webhooks and admin routes)
```

---

## Integration Examples

### CI/CD Pipeline

```yaml
# .github/workflows/api-contract.yml
name: API Contract Validation

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install CodeGuardian
        run: npm install -g codeguardian
      
      - name: Validate API Contracts
        run: codeguardian validate-api-contracts
        working-directory: ./my-app
```

### Pre-commit Hook

```json
// .husky/pre-commit
{
  "hooks": {
    "pre-commit": "codeguardian validate-api-contracts --staged"
  }
}
```

### VS Code Extension

```json
// .vscode/settings.json
{
  "codeguardian.apiContract.enabled": true,
  "codeguardian.apiContract.validateOnSave": true,
  "codeguardian.apiContract.severity": "error"
}
```

---

## Best Practices

### 1. Organize Services by Domain

```typescript
// Good: Organized by domain
// services/clients.ts
export const clientsApi = { ... }

// services/projects.ts  
export const projectsApi = { ... }

// Bad: Everything in one file
// services/api.ts
export const api = { clients: ..., projects: ... }
```

### 2. Use Consistent Naming

```typescript
// Good: Consistent with backend
interface ClientCreate {
  user_id: string;  // Matches backend
  full_name: string;
}

// Bad: Different naming
interface ClientCreate {
  userId: string;   // Mismatch with backend
  fullName: string;
}
```

### 3. Export Types from Backend

```python
# backend/app/schemas/client.py
from pydantic import BaseModel

class ClientCreate(BaseModel):
    name: str
    email: str

# Export for frontend generation
__all__ = ["ClientCreate"]
```

### 4. Handle Query Parameters Properly

```typescript
// Good: Clean query param handling
getUsers: async (filters?: UserFilters) => {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.page) params.append('page', filters.page.toString());
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return ApiService.get(`/api/users${query}`);
}

// Bad: Manual string concatenation
getUsers: (page: number) => 
  ApiService.get(`/api/users?page=${page}`),  // Harder to validate
```

---

## Troubleshooting

### Issue: "No API contracts detected"

**Solution**:
```bash
# Check project structure
ls -la frontend/src/services/
ls -la backend/app/api/

# Verify files exist
# If not, create them or update paths in .codeguardian.json
```

### Issue: "False positives for internal routes"

**Solution**:
```json
// .codeguardian.json
{
  "apiContract": {
    "ignore": [
      "**/admin/**",
      "**/webhooks/**",
      "**/internal/**"
    ]
  }
}
```

### Issue: "Slow validation"

**Solution**:
```json
// .codeguardian.json
{
  "apiContract": {
    "cache": true,
    "incremental": true
  }
}
```

---

**Happy coding! 🚀**
