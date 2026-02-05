# API Contract Guardian - Known Issues & Limitations

## Overview

This document tracks known issues, limitations, and areas for improvement in the API Contract Guardian. While the tool successfully detects many API contract mismatches, there are still edge cases and scenarios that are not fully supported.

## Current Status

### ✅ What's Working

1. **Method Mismatch Detection**
   - Detects when frontend uses wrong HTTP method
   - Analyzes function names to infer intended methods
   - Flags ambiguous endpoints with multiple available methods

2. **Path Mismatch Detection**
   - Identifies when frontend calls non-existent endpoints
   - Suggests similar backend routes
   - Handles path parameter mismatches

3. **Endpoint Extraction**
   - Extracts 96+ frontend services from TypeScript
   - Extracts 245+ backend routes from Python
   - Matches 79+ endpoints correctly

4. **Router Prefix Detection**
   - Automatically detects FastAPI/Flask router prefixes
   - Combines main.py prefixes with router internal prefixes

### ❌ What's NOT Working

## 1. Type/Field Validation

### Issue: Missing Required Fields Not Detected

**Status**: Infrastructure in place, but not functional

**Problem**: 
- Frontend `ClientCreate` interface missing `phone_number` field
- Backend model requires `phone_number` as mandatory field
- Tool does NOT detect this mismatch

**Example**:
```typescript
// Frontend - Missing phone_number
interface ClientCreate {
  name: string;
  email: string;
  // phone_number is missing!
}
```

```python
# Backend - Requires phone_number
class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    phone_number: str = Field(..., description="REQUIRED")  # Missing in frontend!
```

**Expected**: Tool should flag missing required field
**Actual**: No detection

**Root Cause**: 
- Type extraction showing 0 types matched
- Frontend types not being extracted properly
- Type matching logic not connecting interfaces to models

**Impact**: HIGH - Missing required fields cause runtime errors

---

## 2. Type Compatibility Checking

### Issue: Type Mismatches Not Detected

**Status**: Not implemented

**Problem**:
- No validation of TypeScript types vs Python types
- String vs int mismatches not caught
- Date/datetime format mismatches not detected

**Example**:
```typescript
// Frontend
interface Payment {
  amount: string;  // String for decimal
}
```

```python
# Backend
class Payment(BaseModel):
    amount: Decimal  # Decimal type
```

**Expected**: Tool should warn about type compatibility
**Actual**: No type validation performed

**Impact**: MEDIUM - Can cause data conversion errors

---

## 3. Request/Response Body Validation

### Issue: Body Schema Mismatches Not Detected

**Status**: Not implemented

**Problem**:
- Tool doesn't compare request body schemas
- Response type mismatches not detected
- Nested object validation missing

**Example**:
```typescript
// Frontend sends
api.post('/api/clients', {
  name: "John",
  // Missing email field
})
```

```python
# Backend expects
class ClientCreate(BaseModel):
    name: str
    email: str  # Required but not sent!
```

**Expected**: Tool should validate request body against backend model
**Actual**: Only endpoint paths are compared

**Impact**: HIGH - API calls fail with validation errors

---

## 4. Query Parameter Validation

### Issue: Query Parameter Mismatches

**Status**: Partially working

**Problem**:
- Query parameters are stripped for matching (by design)
- But mismatches in required query params not detected
- Type mismatches in query params not caught

**Example**:
```typescript
// Frontend
getUsers({ page: "abc" })  // String instead of number
```

```python
# Backend
@router.get("/users")
async def get_users(page: int = 1):  # Expects int!
    pass
```

**Expected**: Tool should validate query param types
**Actual**: Query params ignored for validation

**Impact**: MEDIUM - Can cause 400 Bad Request errors

---

## 5. Complex Type Handling

### Issue: Advanced TypeScript Types Not Supported

**Status**: Not implemented

**Problem**:
- Union types (`string | number`) not handled
- Generic types (`Array<T>`, `Promise<T>`) not parsed
- Intersection types not supported
- Mapped types not understood

**Example**:
```typescript
// Frontend
interface Response<T> {
  data: T;
  meta: PaginationMeta;
}

type ClientResponse = Response<Client>;
```

**Expected**: Tool should understand generic patterns
**Actual**: Generic types treated as opaque strings

**Impact**: LOW - Most APIs use simple types

---

## 6. GraphQL Support

### Issue: GraphQL Schema Validation Missing

**Status**: Not implemented

**Problem**:
- Tool only supports REST APIs
- GraphQL queries not parsed
- GraphQL schema comparison not available

**Impact**: LOW - Currently focused on REST APIs

---

## 7. WebSocket Support

### Issue: WebSocket Event Validation Missing

**Status**: Not implemented

**Problem**:
- WebSocket events not extracted
- Socket.io event names not validated
- Real-time API contracts not checked

**Impact**: LOW - Most validation is for HTTP APIs

---

## 8. Import/Dependency Resolution

### Issue: Type Imports Not Followed

**Status**: Not implemented

**Problem**:
- Imported types not resolved
- Type aliases not expanded
- Cross-file type definitions not linked

**Example**:
```typescript
// Frontend
import { ClientCreate } from './types';
// Tool doesn't resolve this import!

export const clientsApi = {
  create: (data: ClientCreate) => api.post('/api/clients', data)
}
```

**Expected**: Tool should resolve imported types
**Actual**: Only inline types are extracted

**Impact**: HIGH - Most projects use separate type files

---

## 9. Dynamic Route Generation

### Issue: Dynamically Generated Routes Not Detected

**Status**: Not supported

**Problem**:
- Routes generated at runtime not extracted
- Configuration-based routing not understood
- Dynamic imports not followed

**Example**:
```typescript
// Frontend
const routes = generateRoutesFromConfig(config);
// Tool can't extract these!
```

**Impact**: LOW - Most APIs use static routes

---

## 10. False Positives

### Issue: Legitimate Unmatched Endpoints

**Status**: Ongoing issue

**Problem**:
- Webhook endpoints flagged as unmatched (expected)
- Admin-only routes reported as issues (expected)
- Internal/debug routes marked as problems (expected)

**Current Behavior**: All unmatched endpoints reported
**Desired Behavior**: Allowlist/ignore patterns for known endpoints

**Workaround**: None currently available

**Impact**: MEDIUM - Noise in validation reports

---

## Summary Table

| Issue | Severity | Status | Priority |
|-------|----------|--------|----------|
| Missing required fields | HIGH | Not working | P1 |
| Request/response body validation | HIGH | Not implemented | P1 |
| Type imports not resolved | HIGH | Not implemented | P1 |
| Type compatibility checking | MEDIUM | Not implemented | P2 |
| Query parameter validation | MEDIUM | Partial | P2 |
| Complex TypeScript types | LOW | Not implemented | P3 |
| GraphQL support | LOW | Not implemented | P3 |
| WebSocket support | LOW | Not implemented | P3 |
| Dynamic routes | LOW | Not supported | P3 |
| False positives | MEDIUM | Ongoing | P2 |

---

## Recommendations for Users

### Until Issues Are Fixed:

1. **Manual Type Checking**: Manually compare TypeScript interfaces with Python models
2. **Integration Tests**: Write integration tests to catch API contract issues
3. **API Documentation**: Maintain OpenAPI/Swagger specs as source of truth
4. **Code Reviews**: Have backend and frontend teams review API changes together

### Workarounds:

1. **For Missing Fields**: Use strict TypeScript compilation with exact types
2. **For Type Mismatches**: Use runtime validation libraries (Zod, Pydantic)
3. **For Query Params**: Write unit tests for API client functions
4. **For False Positives**: Document known unmatched endpoints in comments

---

## Future Roadmap

### Phase 1 (Next Release):
- [ ] Fix type extraction to handle imported types
- [ ] Implement required field validation
- [ ] Add request body schema comparison

### Phase 2:
- [ ] Type compatibility checking (string vs int, etc.)
- [ ] Query parameter validation
- [ ] Ignore patterns for webhooks/admin routes

### Phase 3:
- [ ] GraphQL support
- [ ] WebSocket validation
- [ ] Complex TypeScript type handling

---

## Contributing

To help fix these issues:

1. **Type Extraction**: Improve `extractTypesFromFileAST` in `apiContractExtraction.ts`
2. **Field Validation**: Enhance `validateTypes` in `validators/index.ts`
3. **Import Resolution**: Add import following to type extraction
4. **Testing**: Add test cases for the scenarios above

See [Contributing Guide](../CONTRIBUTING.md) for details.

---

**Last Updated**: 2026-02-05
**Version**: 1.0.0
**Status**: Partially Functional - Active Development
