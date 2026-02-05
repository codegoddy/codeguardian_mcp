/**
 * API Contract Guardian - Phase 3 Features
 *
 * Exports all Phase 3 functionality:
 * - GraphQL support
 * - WebSocket validation
 * - Complex TypeScript type handling
 *
 * @format
 */

// GraphQL Support
export {
  extractGraphQLContext,
  extractGraphQLSchema,
  extractGraphQLOperations,
  validateGraphQLOperations,
  parseGraphQLSchema,
  type GraphQLSchema,
  type GraphQLType,
  type GraphQLField,
  type GraphQLOperation,
  type GraphQLFrontendOperation,
  type GraphQLValidationResult,
  type GraphQLIssue,
  type GraphQLContext,
  type GraphQLSelection,
  type GraphQLVariable,
} from "./graphqlSupport.js";

// WebSocket Support
export {
  extractWebSocketContext,
  extractWebSocketServerConfig,
  extractWebSocketClientConfig,
  validateWebSocketContracts,
  type WebSocketEvent,
  type WebSocketPayload,
  type WebSocketNamespace,
  type WebSocketServerConfig,
  type WebSocketClientConfig,
  type WebSocketClientEvent,
  type WebSocketValidationResult,
  type WebSocketIssue,
  type WebSocketContext,
} from "./webSocketSupport.js";

// Complex Type Support
export {
  parseComplexType,
  resolveComplexType,
  checkTypeCompatibility,
  extractAllTypeDefinitions,
  enhanceTypeWithComplexInfo,
  type ComplexTypeInfo,
  type TypeResolutionContext,
  type TypeResolutionError,
  type TypeCompatibilityResult,
  type TypeCompatibilityIssue,
} from "./complexTypeSupport.js";
