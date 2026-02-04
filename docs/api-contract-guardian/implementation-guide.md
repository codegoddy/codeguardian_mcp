# API Contract Guardian - Implementation Guide

## Quick Start

This guide walks through implementing the API Contract Guardian feature step by step.

## Prerequisites

- Understanding of CodeGuardian's existing architecture
- Familiarity with TypeScript AST parsing
- Basic knowledge of Python AST (for backend extraction)

## Project Structure

```
src/
├── api-contract/
│   ├── detector.ts              # Auto-detect project structure
│   ├── context/
│   │   ├── frontend.ts          # Build frontend context
│   │   ├── backend.ts           # Build backend context
│   │   └── contract.ts          # Link frontend ↔ backend
│   ├── extractors/
│   │   ├── typescript.ts        # Extract TS services & types
│   │   └── python.ts            # Extract Python routes & models
│   ├── validators/
│   │   ├── endpoint.ts          # Validate endpoints
│   │   ├── parameter.ts         # Validate parameters
│   │   └── type.ts              # Validate type compatibility
│   └── types.ts                 # Shared types
└── agent/
    └── autoValidator.ts         # Modified to include API validation
```

## Phase 1: Project Detection (Day 1-2)

### Step 1: Create Detector

**File**: `src/api-contract/detector.ts`

```typescript
export interface ProjectStructure {
  frontend?: {
    path: string;
    framework: 'nextjs' | 'react' | 'vue';
    apiPattern: 'services' | 'fetch' | 'axios';
  };
  backend?: {
    path: string;
    framework: 'fastapi' | 'express' | 'flask';
    apiPattern: 'rest' | 'graphql';
  };
  relationship: 'monorepo' | 'separate';
}

export async function detectProjectStructure(
  rootPath: string
): Promise<ProjectStructure> {
  // Implementation
  // 1. Look for package.json (frontend)
  // 2. Look for requirements.txt/pyproject.toml (backend)
  // 3. Check folder structure
  // 4. Detect API patterns
}
```

**Detection Logic**:
1. Scan for `package.json` → Frontend candidate
2. Scan for `requirements.txt` or `pyproject.toml` → Backend candidate
3. Check for common patterns:
   - `frontend/` + `backend/` folders
   - `src/services/*.ts` files
   - `app/main.py` or similar
4. Determine relationship (monorepo vs separate)

### Step 2: Test Detector

Create test cases:
- Next.js + FastAPI monorepo
- React + Express separate repos
- Vue + Flask project
- Frontend-only project (should skip API validation)

## Phase 2: Frontend Context (Day 3-4)

### Step 1: Extract Services

**File**: `src/api-contract/extractors/typescript.ts`

Parse TypeScript files to find:
- Service functions (API calls)
- TypeScript interfaces/types
- API base URL configuration

**Example extraction**:
```typescript
// Input: frontend/src/services/clients.ts
export async function createClient(data: ClientCreate) {
  return api.post('/api/clients', data);
}

// Output: ServiceDefinition
{
  name: 'createClient',
  method: 'POST',
  endpoint: '/api/clients',
  requestType: 'ClientCreate',
  responseType: 'Client',
  file: 'src/services/clients.ts',
  line: 45
}
```

### Step 2: Extract Types

Parse TypeScript interfaces:
```typescript
// Input
export interface ClientCreate {
  name: string;
  email: string;
  user_id: string;
}

// Output: TypeDefinition
{
  name: 'ClientCreate',
  fields: [
    { name: 'name', type: 'string', required: true },
    { name: 'email', type: 'string', required: true },
    { name: 'user_id', type: 'string', required: true }
  ],
  file: 'src/services/clients.ts',
  line: 12
}
```

### Step 3: Build Frontend Context

**File**: `src/api-contract/context/frontend.ts`

```typescript
export async function buildFrontendContext(
  projectPath: string
): Promise<FrontendContext> {
  const services = await extractServices(projectPath);
  const types = await extractTypes(projectPath);
  const config = await extractApiConfig(projectPath);
  
  return {
    framework: detectFramework(projectPath),
    services,
    types,
    apiBaseUrl: config.apiBaseUrl,
    httpClient: config.httpClient
  };
}
```

## Phase 3: Backend Context (Day 5-6)

### Step 1: Extract Routes

**File**: `src/api-contract/extractors/python.ts`

Parse Python files to find FastAPI routes:
```python
# Input: backend/app/routes/clients.py
@app.post("/api/clients")
def create_client(data: ClientCreate) -> Client:
    ...

# Output: RouteDefinition
{
  method: 'POST',
  path: '/api/clients',
  handler: 'create_client',
  requestModel: 'ClientCreate',
  responseModel: 'Client',
  file: 'app/routes/clients.py',
  line: 23
}
```

### Step 2: Extract Models

Parse Pydantic models:
```python
# Input
class ClientCreate(BaseModel):
    name: str
    email: str
    user_id: str

# Output: ModelDefinition
{
  name: 'ClientCreate',
  fields: [
    { name: 'name', type: 'str', required: true },
    { name: 'email', type: 'str', required: true },
    { name: 'user_id', type: 'str', required: true }
  ],
  file: 'app/models/client.py',
  line: 15
}
```

### Step 3: Build Backend Context

**File**: `src/api-contract/context/backend.ts`

```typescript
export async function buildBackendContext(
  projectPath: string
): Promise<BackendContext> {
  const routes = await extractRoutes(projectPath);
  const models = await extractModels(projectPath);
  const config = await extractApiConfig(projectPath);
  
  return {
    framework: 'fastapi',
    routes,
    models,
    apiPrefix: config.apiPrefix
  };
}
```

## Phase 4: Contract Context (Day 7-8)

### Step 1: Link Frontend to Backend

**File**: `src/api-contract/context/contract.ts`

```typescript
export async function buildContractContext(
  frontendContext: FrontendContext,
  backendContext: BackendContext
): Promise<ContractContext> {
  const endpoints = new Map();
  const types = new Map();
  
  // Match frontend services to backend routes
  for (const service of frontendContext.services) {
    const matchingRoute = findMatchingRoute(service, backendContext.routes);
    if (matchingRoute) {
      endpoints.set(service.endpoint, {
        frontend: service,
        backend: matchingRoute,
        score: calculateMatchScore(service, matchingRoute)
      });
    }
  }
  
  // Match frontend types to backend models
  for (const type of frontendContext.types) {
    const matchingModel = findMatchingModel(type, backendContext.models);
    if (matchingModel) {
      types.set(type.name, {
        frontend: type,
        backend: matchingModel,
        compatibility: calculateTypeCompatibility(type, matchingModel)
      });
    }
  }
  
  return { endpoints, types };
}
```

### Step 2: Matching Logic

**Endpoint Matching**:
```typescript
function findMatchingRoute(
  service: ServiceDefinition,
  routes: RouteDefinition[]
): RouteDefinition | undefined {
  // Normalize paths (remove base URL, handle trailing slashes)
  const normalizedEndpoint = normalizePath(service.endpoint);
  
  return routes.find(route => {
    const normalizedRoute = normalizePath(route.path);
    return normalizedRoute === normalizedEndpoint &&
           route.method.toUpperCase() === service.method.toUpperCase();
  });
}
```

**Type Matching**:
```typescript
function findMatchingModel(
  type: TypeDefinition,
  models: ModelDefinition[]
): ModelDefinition | undefined {
  // Try exact name match first
  const exactMatch = models.find(m => m.name === type.name);
  if (exactMatch) return exactMatch;
  
  // Try fuzzy match (handle naming conventions)
  // ClientCreate ↔ client_create
  const normalizedTypeName = normalizeName(type.name);
  return models.find(m => normalizeName(m.name) === normalizedTypeName);
}
```

## Phase 5: Validation (Day 9-10)

### Step 1: Endpoint Validator

**File**: `src/api-contract/validators/endpoint.ts`

```typescript
export function validateEndpoint(
  service: ServiceDefinition,
  route: RouteDefinition
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  // Check HTTP method
  if (service.method !== route.method) {
    issues.push({
      type: 'apiMethodMismatch',
      severity: 'high',
      message: `HTTP method mismatch: frontend uses ${service.method}, backend expects ${route.method}`,
      suggestion: `Change frontend to use ${route.method}`
    });
  }
  
  // Check endpoint path
  if (!pathsMatch(service.endpoint, route.path)) {
    issues.push({
      type: 'apiPathMismatch',
      severity: 'high',
      message: `Endpoint path mismatch`,
      suggestion: `Update path from ${service.endpoint} to ${route.path}`
    });
  }
  
  return issues;
}
```

### Step 2: Parameter Validator

**File**: `src/api-contract/validators/parameter.ts`

```typescript
export function validateParameters(
  frontendType: TypeDefinition,
  backendModel: ModelDefinition
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  // Check for missing required fields
  for (const field of backendModel.fields) {
    if (field.required) {
      const frontendField = frontendType.fields.find(
        f => normalizeName(f.name) === normalizeName(field.name)
      );
      
      if (!frontendField) {
        issues.push({
          type: 'apiMissingRequiredField',
          severity: 'high',
          message: `Missing required field '${field.name}'`,
          suggestion: `Add '${field.name}' to ${frontendType.name}`
        });
      }
    }
  }
  
  // Check for naming mismatches (snake_case vs camelCase)
  for (const frontendField of frontendType.fields) {
    const backendField = backendModel.fields.find(
      f => normalizeName(f.name) === normalizeName(frontendField.name)
    );
    
    if (!backendField) {
      // Field exists in frontend but not backend
      // This might be okay (frontend-only field)
      continue;
    }
    
    if (frontendField.name !== backendField.name) {
      issues.push({
        type: 'apiNamingConventionMismatch',
        severity: 'medium',
        message: `Naming convention mismatch: '${frontendField.name}' should be '${backendField.name}'`,
        suggestion: `Rename to match backend convention`
      });
    }
  }
  
  return issues;
}
```

### Step 3: Type Validator

**File**: `src/api-contract/validators/type.ts`

```typescript
export function validateTypeCompatibility(
  frontendType: string,
  backendType: string
): { compatible: boolean; issues: ValidationIssue[] } {
  const typeMap: Record<string, string[]> = {
    'string': ['str', 'String'],
    'number': ['int', 'float', 'Number'],
    'boolean': ['bool', 'Boolean'],
    'Date': ['datetime', 'date']
  };
  
  const compatibleTypes = typeMap[frontendType] || [];
  
  if (!compatibleTypes.includes(backendType)) {
    return {
      compatible: false,
      issues: [{
        type: 'apiTypeMismatch',
        severity: 'medium',
        message: `Type mismatch: frontend uses '${frontendType}', backend expects '${backendType}'`,
        suggestion: `Ensure types are compatible or add type conversion`
      }]
    };
  }
  
  return { compatible: true, issues: [] };
}
```

## Phase 6: Integration (Day 11-12)

### Step 1: Extend Existing Types

**File**: `src/tools/validation/types.ts`

Add new issue types:
```typescript
export interface ValidationIssue {
  type:
    | 'nonExistentFunction'
    | 'wrongParamCount'
    | 'unusedImport'
    | 'apiContractMismatch'      // NEW
    | 'apiEndpointNotFound'      // NEW
    | 'apiMethodMismatch'        // NEW
    | 'apiPathMismatch'          // NEW
    | 'apiMissingRequiredField'  // NEW
    | 'apiNamingConventionMismatch' // NEW
    | 'apiTypeMismatch';         // NEW
  // ... rest of fields
}
```

### Step 2: Modify Guardian Agent

**File**: `src/agent/autoValidator.ts`

```typescript
private async validateFile(filePath: string): Promise<void> {
  // ... existing validation
  
  // NEW: API Contract validation
  if (this.shouldValidateApiContract(filePath)) {
    const contractIssues = await this.validateApiContract(filePath);
    allIssues.push(...contractIssues);
  }
  
  // ... rest of validation
}

private shouldValidateApiContract(filePath: string): boolean {
  // Only validate service files and type definitions
  return filePath.includes('/services/') ||
         filePath.includes('/types/') ||
         filePath.endsWith('.d.ts');
}

private async validateApiContract(filePath: string): Promise<ValidationIssue[]> {
  if (!this.contractContext) {
    // Lazy load contract context
    this.contractContext = await buildContractContext(
      this.frontendContext,
      this.backendContext
    );
  }
  
  // Find affected service/type
  const service = findServiceByFile(filePath, this.frontendContext);
  if (!service) return [];
  
  // Get matching backend route
  const endpoint = this.contractContext.endpoints.get(service.endpoint);
  if (!endpoint) {
    return [{
      type: 'apiEndpointNotFound',
      severity: 'high',
      message: `Endpoint '${service.endpoint}' not found in backend`,
      suggestion: 'Check if backend route exists'
    }];
  }
  
  // Run validators
  const issues: ValidationIssue[] = [];
  issues.push(...validateEndpoint(service, endpoint.backend));
  
  if (service.requestType) {
    const typeMapping = this.contractContext.types.get(service.requestType);
    if (typeMapping) {
      issues.push(...validateParameters(
        typeMapping.frontend,
        typeMapping.backend
      ));
    }
  }
  
  return issues;
}
```

### Step 3: Configuration

**File**: `src/config/api-contract.ts`

```typescript
export interface ApiContractConfig {
  enabled: boolean;
  autoDetect: boolean;
  projects?: {
    frontend?: {
      path: string;
      framework: string;
    };
    backend?: {
      path: string;
      framework: string;
    };
  };
  validation?: {
    endpoint: boolean;
    parameters: boolean;
    types: boolean;
    strict: boolean;
  };
}

export const defaultConfig: ApiContractConfig = {
  enabled: true,
  autoDetect: true,
  validation: {
    endpoint: true,
    parameters: true,
    types: true,
    strict: false
  }
};
```

## Phase 7: Testing (Day 13-14)

### Unit Tests

Create tests for each component:
- `detector.test.ts` - Project structure detection
- `typescript-extractor.test.ts` - Frontend extraction
- `python-extractor.test.ts` - Backend extraction
- `validators.test.ts` - All validators

### Integration Tests

Test full validation flow:
- Detect project → Build contexts → Validate → Report issues

### E2E Tests

Test with real projects:
- DevHQ frontend (your project)
- Sample FastAPI backend

## Phase 8: Documentation (Day 15)

### User Documentation
- README with setup instructions
- Configuration guide
- Troubleshooting

### Developer Documentation
- Architecture overview
- Contributing guide
- API reference

## Success Criteria

✅ **MVP Complete When**:
1. Auto-detects Next.js + FastAPI projects
2. Extracts services from TypeScript
3. Extracts routes from Python
4. Validates endpoint existence
5. Reports mismatches in real-time
6. Works with existing guardian agent

✅ **Polish Complete When**:
1. Supports multiple frameworks (Express, Flask)
2. Validates parameter names and types
3. Handles naming conventions (snake_case vs camelCase)
4. Provides helpful error messages
5. Has comprehensive tests
6. Documentation is complete

## Next Steps

1. Review this guide
2. Set up development environment
3. Start with Phase 1 (Project Detection)
4. Test each phase before moving to next
5. Iterate based on feedback

## Resources

- TypeScript AST Parser: `typescript` compiler API
- Python AST Parser: `tree-sitter-python`
- Existing CodeGuardian extractors: `src/tools/validation/extractors/`
- Test examples: `tests/unit/validation/`

---

**Ready to start? Begin with Phase 1: Project Detection**
