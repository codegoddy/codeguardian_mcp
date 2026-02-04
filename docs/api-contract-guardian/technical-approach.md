# API Contract Guardian - Technical Approach

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    API Contract Guardian                     │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Frontend   │   │   Contract   │   │   Backend    │
│   Context    │◄──┤   Context    │──►│   Context    │
│   Builder    │   │   (Bridge)   │   │   Builder    │
└──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Extractors  │   │   Mappers    │   │  Extractors  │
│  - Services  │   │   - Links    │   │  - Routes    │
│  - Types     │   │   - Types    │   │  - Models    │
│  - Config    │   │   - Validate │   │  - Config    │
└──────────────┘   └──────────────┘   └──────────────┘
```

## Core Components

### 1. Project Detector

**Purpose**: Automatically detect project structure without configuration

**Detection Strategy**:
```typescript
interface ProjectStructure {
  frontend?: {
    path: string;
    framework: 'nextjs' | 'react' | 'vue' | 'angular';
    apiPattern: 'services' | 'fetch' | 'axios' | 'react-query';
  };
  backend?: {
    path: string;
    framework: 'fastapi' | 'express' | 'flask' | 'django';
    apiPattern: 'rest' | 'graphql' | 'websocket';
  };
  relationship: 'monorepo' | 'separate' | 'frontend-only';
}
```

**Detection Heuristics**:
- Look for `package.json` with Next.js/React dependencies
- Look for `requirements.txt` or `pyproject.toml` with FastAPI/Flask
- Check for common folder patterns (`frontend/`, `backend/`, `src/`, `app/`)
- Detect API base URLs in config files
- Find proxy configurations

### 2. Context Builders

#### Frontend Context Builder

**Extracts**:
- API service functions from `services/*.ts`
- TypeScript interfaces/types
- API base URL from config
- HTTP client configuration (axios/fetch)

**Output**:
```typescript
interface FrontendContext {
  framework: string;
  services: ServiceDefinition[];
  types: TypeDefinition[];
  apiBaseUrl: string;
  httpClient: 'axios' | 'fetch' | 'react-query';
}
```

#### Backend Context Builder

**Extracts**:
- Route definitions from decorators
- Pydantic models/schemas
- OpenAPI spec (if available)
- API configuration

**Output**:
```typescript
interface BackendContext {
  framework: string;
  routes: RouteDefinition[];
  models: ModelDefinition[];
  apiPrefix: string;
  openApiSpec?: OpenAPISpec;
}
```

### 3. Contract Context (The Bridge)

**Purpose**: Link frontend and backend contexts

**Key Functions**:
1. **Endpoint Mapping**: Match frontend service calls to backend routes
2. **Type Mapping**: Correlate TypeScript types with Pydantic models
3. **Validation Rules**: Define what constitutes a mismatch

**Data Structure**:
```typescript
interface ContractContext {
  // Endpoint mappings
  endpoints: Map<string, {
    frontend: ServiceCall;
    backend: RouteDefinition;
    score: number; // Match confidence
  }>;
  
  // Type mappings
  types: Map<string, {
    frontend: TypeDefinition;
    backend: ModelDefinition;
    compatibility: CompatibilityScore;
  }>;
  
  // Validation configuration
  rules: ValidationRules;
}
```

### 4. Validation Engine

**Validation Types**:

1. **Endpoint Validation**
   - Does the endpoint exist?
   - Does the HTTP method match?
   - Is the URL pattern correct?

2. **Parameter Validation**
   - Are all required parameters present?
   - Do parameter names match (snake_case vs camelCase)?
   - Are parameter types compatible?

3. **Response Validation**
   - Does response type match expected type?
   - Are all required fields present?
   - Are field types compatible?

4. **Schema Validation**
   - Deep comparison of nested objects
   - Array type validation
   - Optional vs required field detection

### 5. Integration with Guardian

**How it fits into existing flow**:

```typescript
// Current guardian validation flow:
1. File change detected
2. Build context (orchestrateContext)
3. Validate symbols
4. Validate patterns
5. Validate dead code
6. Report issues

// New flow with API Contract:
1. File change detected
2. Build context (orchestrateContext)
3. Validate symbols
4. Validate patterns
5. Validate dead code
6. ✅ NEW: Validate API contracts (if file is service/API related)
7. Report issues
```

**Minimal Interference Principle**:
- Only runs when relevant files change (services, types, routes)
- Reuses existing context building infrastructure
- Adds new validation tier without modifying existing ones
- Can be disabled via configuration

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goals**:
- Project structure detection
- Frontend context builder (TypeScript)
- Basic endpoint extraction

**Deliverables**:
- `src/api-contract/detector.ts` - Auto-detect project structure
- `src/api-contract/context/frontend.ts` - Build frontend context
- `src/api-contract/extractors/typescript.ts` - Extract services & types

### Phase 2: Backend Integration (Week 2)

**Goals**:
- Backend context builder (Python)
- Route extraction from FastAPI
- Basic contract linking

**Deliverables**:
- `src/api-contract/context/backend.ts` - Build backend context
- `src/api-contract/extractors/python.ts` - Extract routes & models
- `src/api-contract/contract-context.ts` - Link frontend ↔ backend

### Phase 3: Validation (Week 3)

**Goals**:
- Endpoint validation
- Parameter validation
- Type compatibility checking

**Deliverables**:
- `src/api-contract/validators/endpoint.ts`
- `src/api-contract/validators/parameter.ts`
- `src/api-contract/validators/type.ts`

### Phase 4: Integration (Week 4)

**Goals**:
- Integrate with Guardian agent
- Real-time validation
- Error reporting

**Deliverables**:
- Modify `src/agent/autoValidator.ts` to include API contract validation
- Add API contract issues to alert formatting
- Configuration options

## Technical Decisions

### 1. Context Separation vs Unified

**Decision**: Separate contexts with Contract Context as bridge

**Rationale**:
- Existing context system is optimized per-language
- Clean separation allows independent evolution
- Contract Context can be built lazily (only when needed)
- Easier to test and maintain

### 2. Extraction Method

**Decision**: AST-based extraction for both frontend and backend

**Rationale**:
- Most accurate (parses actual code)
- No runtime dependencies
- Works with any code style
- Reuses existing tree-sitter infrastructure

### 3. Type Mapping Strategy

**Decision**: Structural typing (shape-based) not nominal (name-based)

**Rationale**:
- TypeScript and Python have different naming conventions
- Focus on "does it have the right fields?" not "is it called the same thing?"
- More flexible for vibecoders who rename things

### 4. Validation Timing

**Decision**: On file save, debounced (1 second)

**Rationale**:
- Fast feedback without being annoying
- Aligns with existing guardian behavior
- Can be changed via configuration

## Integration Points

### With Existing Context System

```typescript
// Extend ProjectContext to include API contract info
interface ProjectContext {
  // ... existing fields
  apiContract?: ContractContext;
}

// Extend orchestrateContext to build contract context
export async function orchestrateContext(options: {
  projectPath: string;
  // ... existing options
  enableApiContract?: boolean;
}): Promise<OrchestrationContext> {
  // ... existing context building
  
  if (options.enableApiContract) {
    const contractContext = await buildContractContext(projectPath);
    context.apiContract = contractContext;
  }
  
  return context;
}
```

### With Existing Validation System

```typescript
// Add new validation function
export function validateApiContract(
  frontendContext: FrontendContext,
  backendContext: BackendContext,
  changedFile: string
): ApiContractIssue[] {
  // Implementation
}

// Add to ValidationIssue type
interface ValidationIssue {
  type: 
    | 'nonExistentFunction'
    | 'wrongParamCount'
    | 'unusedImport'
    | 'apiContractMismatch'  // NEW
    | 'apiEndpointNotFound'  // NEW
    | 'apiTypeMismatch';     // NEW
  // ... rest of fields
}
```

### With Guardian Agent

```typescript
// In autoValidator.ts
private async validateFile(filePath: string): Promise<void> {
  // ... existing validation
  
  // NEW: API Contract validation
  if (this.isApiContractEnabled && this.isApiRelatedFile(filePath)) {
    const contractIssues = await this.validateApiContract(filePath);
    allIssues.push(...contractIssues);
  }
  
  // ... rest of validation
}
```

## Configuration

### Default (Zero Config)
```json
{
  "apiContract": {
    "enabled": true,
    "autoDetect": true
  }
}
```

### Explicit Configuration
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

## Error Handling

### Graceful Degradation
- If backend not accessible, validate what we can from frontend
- If parsing fails, log warning but don't crash
- If detection fails, allow manual configuration

### User Feedback
- Clear error messages with suggestions
- Links to documentation
- Option to disable specific validations
- "Learn more" links for complex issues

## Testing Strategy

### Unit Tests
- Test each extractor independently
- Test type mapping logic
- Test validation rules

### Integration Tests
- Test full validation flow
- Test with real projects (DevHQ frontend)
- Test error scenarios

### E2E Tests
- Test guardian agent integration
- Test real-time validation
- Test configuration changes

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading**: Only build contract context when needed
2. **Caching**: Cache parsed ASTs and extracted definitions
3. **Incremental**: Only re-validate changed endpoints
4. **Debouncing**: Wait for user to stop typing before validating

### Benchmarks
- Context building: < 2 seconds for typical project
- Validation: < 500ms per file
- Memory: < 100MB additional for contract context

## Future Enhancements

### Phase 2 Features
- OpenAPI spec generation from code
- Automatic type generation (Pydantic ↔ TypeScript)
- API documentation sync
- Breaking change detection

### Phase 3 Features
- WebSocket event validation
- GraphQL schema validation
- gRPC contract validation
- Multi-backend support (microservices)

## Conclusion

This approach:
- ✅ Builds on existing infrastructure
- ✅ Minimal interference with current tools
- ✅ Separates concerns (frontend/backend/contract)
- ✅ Extensible for future frameworks
- ✅ Provides immediate value to vibecoders

The key insight: **Don't replace existing validation, enhance it with a new tier focused on API contracts.**
