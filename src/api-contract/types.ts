/**
 * API Contract Guardian - Shared Types
 *
 * Type definitions for API contract validation between frontend and backend.
 *
 * @format
 */

// ============================================================================
// Project Structure Types
// ============================================================================

export type FrontendFramework = "nextjs" | "react" | "vue" | "angular" | "svelte";
export type BackendFramework = "fastapi" | "express" | "flask" | "django" | "nestjs";
export type ApiPattern = "rest" | "graphql" | "trpc" | "websocket";
export type HttpClient = "axios" | "fetch" | "react-query" | "swr";
export type ProjectRelationship = "monorepo" | "separate" | "frontend-only" | "backend-only";

export interface FrontendProject {
  path: string;
  framework: FrontendFramework;
  apiPattern: ApiPattern;
  httpClient: HttpClient;
  apiBaseUrl?: string;
}

export interface BackendProject {
  path: string;
  framework: BackendFramework;
  apiPattern: ApiPattern;
  apiPrefix?: string;
}

export interface ProjectStructure {
  frontend?: FrontendProject;
  backend?: BackendProject;
  relationship: ProjectRelationship;
}

// ============================================================================
// Frontend Context Types
// ============================================================================

export interface ServiceDefinition {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  requestType?: string;
  responseType?: string;
  queryParams?: QueryParam[];
  file: string;
  line: number;
  column?: number;
}

export interface QueryParam {
  name: string;
  type: string;
  required: boolean;
}

export interface TypeField {
  name: string;
  type: string;
  required: boolean;
  optional?: boolean;
}

export interface TypeDefinition {
  name: string;
  fields: TypeField[];
  file: string;
  line: number;
  kind: "interface" | "type" | "class";
}

export interface FrontendContext {
  framework: FrontendFramework;
  services: ServiceDefinition[];
  types: TypeDefinition[];
  apiBaseUrl: string;
  httpClient: HttpClient;
}

// ============================================================================
// Backend Context Types
// ============================================================================

export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  handler: string;
  requestModel?: string;
  responseModel?: string;
  file: string;
  line: number;
}

export interface ModelField {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
}

export interface ModelDefinition {
  name: string;
  fields: ModelField[];
  file: string;
  line: number;
  baseClasses?: string[];
}

export interface BackendContext {
  framework: BackendFramework;
  routes: RouteDefinition[];
  models: ModelDefinition[];
  apiPrefix: string;
  openApiSpec?: Record<string, unknown>;
}

// ============================================================================
// Contract Context Types
// ============================================================================

export interface EndpointMapping {
  frontend: ServiceDefinition;
  backend: RouteDefinition;
  score: number; // Match confidence 0-100
}

export interface TypeMapping {
  frontend: TypeDefinition;
  backend: ModelDefinition;
  compatibility: CompatibilityScore;
}

export interface CompatibilityScore {
  score: number; // 0-100
  issues: string[];
}

export interface ContractContext {
  endpoints: Map<string, EndpointMapping>;
  types: Map<string, TypeMapping>;
  unmatchedFrontend: ServiceDefinition[];
  unmatchedBackend: RouteDefinition[];
}

// ============================================================================
// Validation Types
// ============================================================================

export type ApiContractIssueType =
  | "apiContractMismatch"
  | "apiEndpointNotFound"
  | "apiMethodMismatch"
  | "apiPathMismatch"
  | "apiMissingRequiredField"
  | "apiNamingConventionMismatch"
  | "apiTypeMismatch"
  | "apiExtraField";

export interface ApiContractIssue {
  type: ApiContractIssueType;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  file: string;
  line: number;
  endpoint?: string;
  suggestion: string;
  confidence?: number;
}

export interface ValidationRules {
  endpoint: boolean;
  parameters: boolean;
  types: boolean;
  strict: boolean;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ApiContractConfig {
  enabled: boolean;
  autoDetect: boolean;
  projects?: {
    frontend?: {
      path: string;
      framework: FrontendFramework;
    };
    backend?: {
      path: string;
      framework: BackendFramework;
    };
  };
  validation?: ValidationRules;
  ignore?: string[];
  typeMappings?: Record<string, string>;
}

export const defaultConfig: ApiContractConfig = {
  enabled: true,
  autoDetect: true,
  validation: {
    endpoint: true,
    parameters: true,
    types: true,
    strict: false,
  },
  ignore: ["**/test/**", "**/*.test.ts", "**/mocks/**"],
};
