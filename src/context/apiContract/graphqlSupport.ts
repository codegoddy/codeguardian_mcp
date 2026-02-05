/**
 * API Contract Guardian - GraphQL Support
 *
 * Extracts and validates GraphQL schemas, queries, and mutations.
 * Detects mismatches between frontend GraphQL operations and backend schema.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { logger } from "../../utils/logger.js";
import { getParser } from "../../tools/validation/parser.js";

// ============================================================================
// Types
// ============================================================================

export interface GraphQLSchema {
  types: GraphQLType[];
  queries: GraphQLOperation[];
  mutations: GraphQLOperation[];
  subscriptions: GraphQLOperation[];
  file: string;
  line: number;
}

export interface GraphQLType {
  name: string;
  kind: "object" | "input" | "enum" | "interface" | "union" | "scalar";
  fields: GraphQLField[];
  file: string;
  line: number;
}

export interface GraphQLField {
  name: string;
  type: string;
  required: boolean;
  arguments?: GraphQLArgument[];
}

export interface GraphQLArgument {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

export interface GraphQLOperation {
  name: string;
  type: "query" | "mutation" | "subscription";
  returnType: string;
  arguments: GraphQLArgument[];
  file: string;
  line: number;
  selections?: GraphQLSelection[]; // For frontend queries
}

export interface GraphQLSelection {
  name: string;
  alias?: string;
  subSelections?: GraphQLSelection[];
}

export interface GraphQLFrontendOperation {
  name: string;
  type: "query" | "mutation" | "subscription";
  operationString: string;
  returnType?: string;
  variables: GraphQLVariable[];
  selections: GraphQLSelection[];
  file: string;
  line: number;
  framework?: "apollo" | "relay" | "urql" | "graphql-request" | "raw";
}

export interface GraphQLVariable {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

export interface GraphQLValidationResult {
  operation: GraphQLFrontendOperation;
  schemaOperation?: GraphQLOperation;
  issues: GraphQLIssue[];
  score: number;
}

export interface GraphQLIssue {
  severity: "error" | "warning" | "info";
  type: "missing_field" | "type_mismatch" | "missing_operation" | "unused_variable" | "deprecated_field";
  message: string;
  field?: string;
  expectedType?: string;
  actualType?: string;
  line?: number;
}

export interface GraphQLContext {
  schemas: GraphQLSchema[];
  frontendOperations: GraphQLFrontendOperation[];
  validationResults: GraphQLValidationResult[];
  unmatchedOperations: GraphQLFrontendOperation[];
}

// ============================================================================
// Schema Extraction (Backend)
// ============================================================================

/**
 * Extract GraphQL schema from .graphql files or schema definitions
 */
export async function extractGraphQLSchema(filePath: string): Promise<GraphQLSchema | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    
    // Check if it's a GraphQL schema file
    if (filePath.endsWith(".graphql") || filePath.endsWith(".gql")) {
      return parseGraphQLSchema(content, filePath);
    }
    
    // Check for GraphQL schema in TypeScript/JavaScript files
    if (filePath.endsWith(".ts") || filePath.endsWith(".js") || filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
      return extractSchemaFromCode(content, filePath);
    }
    
    return null;
  } catch (err) {
    logger.debug(`Failed to extract GraphQL schema from ${filePath}: ${err}`);
    return null;
  }
}

export function parseGraphQLSchema(content: string, filePath: string): GraphQLSchema {
  const schema: GraphQLSchema = {
    types: [],
    queries: [],
    mutations: [],
    subscriptions: [],
    file: filePath,
    line: 1,
  };

  const lines = content.split("\n");
  let currentType: Partial<GraphQLType> | null = null;
  let lineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    lineNum = i + 1;
    const line = lines[i].trim();

    // Skip comments and empty lines
    if (!line || line.startsWith("#")) continue;

    // Type definition: type User { ... }
    const typeMatch = line.match(/^type\s+(\w+)\s*\{/);
    if (typeMatch) {
      const typeName = typeMatch[1];
      
      // Handle Query, Mutation, Subscription specially
      if (typeName === "Query" || typeName === "Mutation" || typeName === "Subscription") {
        if (currentType) {
          schema.types.push(currentType as GraphQLType);
          currentType = null;
        }
        
        // Parse the entire Query/Mutation/Subscription block
        const { operations, endLine } = parseQueryTypeBlock(content, i, typeName.toLowerCase() as "query" | "mutation" | "subscription");
        if (typeName === "Query") {
          schema.queries.push(...operations);
        } else if (typeName === "Mutation") {
          schema.mutations.push(...operations);
        } else if (typeName === "Subscription") {
          schema.subscriptions.push(...operations);
        }
        
        // Skip to the end of this type block
        i = endLine;
        continue;
      }
      
      if (currentType) {
        schema.types.push(currentType as GraphQLType);
      }
      currentType = {
        name: typeName,
        kind: "object",
        fields: [],
        file: filePath,
        line: lineNum,
      };
      continue;
    }

    // Input type: input CreateUserInput { ... }
    const inputMatch = line.match(/^input\s+(\w+)\s*\{/);
    if (inputMatch) {
      if (currentType) {
        schema.types.push(currentType as GraphQLType);
      }
      currentType = {
        name: inputMatch[1],
        kind: "input",
        fields: [],
        file: filePath,
        line: lineNum,
      };
      continue;
    }

    // Enum type: enum Status { ... }
    const enumMatch = line.match(/^enum\s+(\w+)\s*\{/);
    if (enumMatch) {
      if (currentType) {
        schema.types.push(currentType as GraphQLType);
      }
      currentType = {
        name: enumMatch[1],
        kind: "enum",
        fields: [],
        file: filePath,
        line: lineNum,
      };
      continue;
    }

    // Interface type: interface Node { ... }
    const interfaceMatch = line.match(/^interface\s+(\w+)\s*\{/);
    if (interfaceMatch) {
      if (currentType) {
        schema.types.push(currentType as GraphQLType);
      }
      currentType = {
        name: interfaceMatch[1],
        kind: "interface",
        fields: [],
        file: filePath,
        line: lineNum,
      };
      continue;
    }

    // Type closing
    if (line === "}" && currentType) {
      schema.types.push(currentType as GraphQLType);
      currentType = null;
      continue;
    }

    // Field definition within type
    if (currentType && line.includes(":")) {
      const field = parseGraphQLField(line);
      if (field) {
        currentType.fields!.push(field);
      }
    }
  }

  // Don't forget the last type
  if (currentType) {
    schema.types.push(currentType as GraphQLType);
  }

  return schema;
}

function parseGraphQLField(line: string): GraphQLField | null {
  // Parse: fieldName: Type! or fieldName(arg: Type!): ReturnType!
  const fieldMatch = line.match(/^(\w+)(?:\(([^)]+)\))?\s*:\s*(.+)$/);
  if (!fieldMatch) return null;

  const name = fieldMatch[1];
  const argsString = fieldMatch[2];
  const typeString = fieldMatch[3].trim();

  const { type, required } = parseGraphQLType(typeString);

  const field: GraphQLField = {
    name,
    type,
    required,
  };

  if (argsString) {
    field.arguments = parseGraphQLArguments(argsString);
  }

  return field;
}

function parseGraphQLType(typeString: string): { type: string; required: boolean } {
  const required = typeString.endsWith("!");
  const type = typeString.replace(/!$/, "").trim();
  return { type, required };
}

function parseGraphQLArguments(argsString: string): GraphQLArgument[] {
  const args: GraphQLArgument[] = [];
  const argMatches = argsString.matchAll(/(\w+)\s*:\s*([^,]+)/g);

  for (const match of argMatches) {
    const name = match[1];
    const typeStr = match[2].trim();
    const { type, required } = parseGraphQLType(typeStr);

    args.push({
      name,
      type,
      required,
    });
  }

  return args;
}

function parseQueryTypeBlock(content: string, startLine: number, type: "query" | "mutation" | "subscription"): { operations: GraphQLOperation[]; endLine: number } {
  const operations: GraphQLOperation[] = [];
  const lines = content.split("\n");
  let braceCount = 1;  // We start inside the type definition (the opening { on startLine)
  let i = startLine + 1;  // Start from the line AFTER the type declaration

  while (i < lines.length && braceCount > 0) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Count braces more carefully
    for (const char of line) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
    }

    // If we've closed the type, stop
    if (braceCount <= 0) break;

    // Parse operation field - must be at braceCount == 1 (inside the type but not nested)
    // and the line should contain a field definition
    if (braceCount === 1 && trimmedLine.includes(":")) {
      // Match field name, optional args, colon, and return type (including arrays and non-null)
      const opMatch = trimmedLine.match(/^(\w+)(?:\(([^)]+)\))?\s*:\s*([\w\[\]!]+)/);
      if (opMatch) {
        const name = opMatch[1];
        const argsString = opMatch[2];
        const returnType = opMatch[3];

        operations.push({
          name,
          type,
          returnType,
          arguments: argsString ? parseGraphQLArguments(argsString) : [],
          file: "schema.graphql",
          line: i + 1,
        });
      }
    }

    i++;
  }

  return { operations, endLine: i };
}

function extractSchemaFromCode(content: string, filePath: string): GraphQLSchema | null {
  // Look for schema definitions in code (e.g., gql`...` or buildSchema(`...`))
  const gqlMatch = content.match(/gql`([\s\S]*?)`/);
  const buildSchemaMatch = content.match(/buildSchema\(`([\s\S]*?)`\)/);
  const schemaMatch = content.match(/typeDefs\s*=\s*`([\s\S]*?)`/);

  const schemaContent = gqlMatch?.[1] || buildSchemaMatch?.[1] || schemaMatch?.[1];

  if (schemaContent) {
    return parseGraphQLSchema(schemaContent, filePath);
  }

  return null;
}

// ============================================================================
// Frontend Operation Extraction
// ============================================================================

/**
 * Extract GraphQL operations from frontend code
 */
export async function extractGraphQLOperations(filePath: string): Promise<GraphQLFrontendOperation[]> {
  const operations: GraphQLFrontendOperation[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");

    // Detect framework
    const framework = detectGraphQLFramework(content);

    // Extract operations based on framework patterns
    if (framework === "apollo") {
      operations.push(...extractApolloOperations(content, filePath));
    } else if (framework === "relay") {
      operations.push(...extractRelayOperations(content, filePath));
    } else if (framework === "urql") {
      operations.push(...extractUrqlOperations(content, filePath));
    } else {
      // Generic extraction
      operations.push(...extractGenericOperations(content, filePath));
    }

    // Set framework on all operations
    operations.forEach(op => op.framework = framework);

  } catch (err) {
    logger.debug(`Failed to extract GraphQL operations from ${filePath}: ${err}`);
  }

  return operations;
}

function detectGraphQLFramework(content: string): GraphQLFrontendOperation["framework"] {
  if (content.includes("@apollo/client") || content.includes("useQuery") || content.includes("useMutation")) {
    return "apollo";
  }
  if (content.includes("react-relay") || content.includes("graphql") && content.includes("@argumentDefinitions")) {
    return "relay";
  }
  if (content.includes("urql") || content.includes("useQuery") && content.includes("urql")) {
    return "urql";
  }
  if (content.includes("graphql-request")) {
    return "graphql-request";
  }
  return "raw";
}

function extractApolloOperations(content: string, filePath: string): GraphQLFrontendOperation[] {
  const operations: GraphQLFrontendOperation[] = [];

  try {
    const parser = getParser("typescript");
    const tree = parser.parse(content);

    // Traverse AST to find tagged template expressions like gql`...`
    function traverse(node: any) {
      if (!node) return;

      // Look for tagged_template_expression (gql`...`)
      if (node.type === "tagged_template_expression") {
        const tagNode = node.childForFieldName("tag");
        const templateNode = node.childForFieldName("template");

        if (tagNode && templateNode) {
          const tagName = content.slice(tagNode.startIndex, tagNode.endIndex);

          // Check if it's a gql tag
          if (tagName === "gql") {
            // Extract the template literal content
            const templateContent = content.slice(templateNode.startIndex, templateNode.endIndex);
            // Remove backticks and get the GraphQL string
            const graphqlString = templateContent.replace(/^`/, "").replace(/`$/, "");
            const line = node.startPosition.row + 1;

            const operation = parseGraphQLOperationString(graphqlString, filePath, line);
            if (operation) {
              operations.push(operation);
            }
          }
        }
      }

      // Recursively traverse children
      for (const child of node.children || []) {
        traverse(child);
      }
    }

    traverse(tree.rootNode);
  } catch (err) {
    logger.debug(`AST parsing failed for ${filePath}: ${err}`);
  }

  return operations;
}

function extractRelayOperations(content: string, filePath: string): GraphQLFrontendOperation[] {
  // Similar to Apollo but with Relay-specific syntax
  return extractApolloOperations(content, filePath);
}

function extractUrqlOperations(content: string, filePath: string): GraphQLFrontendOperation[] {
  // Similar pattern
  return extractApolloOperations(content, filePath);
}

function extractGenericOperations(content: string, filePath: string): GraphQLFrontendOperation[] {
  // Look for any GraphQL-like strings
  const operations: GraphQLFrontendOperation[] = [];

  // Match query/mutation/subscription strings
  const queryRegex = /(?:query|mutation|subscription)\s+(\w+)/g;
  let match;

  while ((match = queryRegex.exec(content)) !== null) {
    const operationName = match[1];
    const line = content.substring(0, match.index).split("\n").length;

    // Try to extract the full operation
    const startIdx = match.index;
    let endIdx = startIdx;
    let braceCount = 0;
    let inString = false;

    for (let i = startIdx; i < content.length; i++) {
      const char = content[i];
      if (char === '"' || char === "'" || char === "`") {
        inString = !inString;
      }
      if (!inString) {
        if (char === "{") braceCount++;
        if (char === "}") braceCount--;
        if (braceCount === 0 && char === "}") {
          endIdx = i + 1;
          break;
        }
      }
    }

    const operationString = content.substring(startIdx, endIdx);
    const operation = parseGraphQLOperationString(operationString, filePath, line);
    if (operation) {
      operations.push(operation);
    }
  }

  return operations;
}

function parseGraphQLOperationString(
  operationString: string,
  filePath: string,
  line: number
): GraphQLFrontendOperation | null {
  const lines = operationString.split("\n");
  const firstLine = lines[0].trim();

  // Determine operation type
  let type: GraphQLFrontendOperation["type"] = "query";
  if (firstLine.toLowerCase().startsWith("mutation")) {
    type = "mutation";
  } else if (firstLine.toLowerCase().startsWith("subscription")) {
    type = "subscription";
  }

  // Extract operation name
  const nameMatch = firstLine.match(/(?:query|mutation|subscription)\s+(\w+)/);
  const name = nameMatch ? nameMatch[1] : "anonymous";

  // Extract variables
  const variables: GraphQLVariable[] = [];
  const varMatch = firstLine.match(/\(([^)]+)\)/);
  if (varMatch) {
    const varDefs = varMatch[1].split(",");
    for (const varDef of varDefs) {
      const parts = varDef.trim().match(/\$(\w+)\s*:\s*(\w+!?)/);
      if (parts) {
        variables.push({
          name: parts[1],
          type: parts[2].replace("!", ""),
          required: parts[2].endsWith("!"),
        });
      }
    }
  }

  // Extract selections (fields being requested)
  const selections = parseSelections(operationString);

  return {
    name,
    type,
    operationString,
    variables,
    selections,
    file: filePath,
    line,
  };
}

function parseSelections(operationString: string): GraphQLSelection[] {
  const selections: GraphQLSelection[] = [];

  // Extract content between outer braces
  const braceMatch = operationString.match(/\{([\s\S]*)\}$/);
  if (!braceMatch) return selections;

  const content = braceMatch[1];
  const lines = content.split("\n");

  let currentSelection: GraphQLSelection | null = null;
  let braceCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes("{")) {
      braceCount++;
      if (currentSelection) {
        // This is a nested selection
        if (!currentSelection.subSelections) {
          currentSelection.subSelections = [];
        }
      }
    }

    if (trimmed.includes("}")) {
      braceCount--;
      if (braceCount === 0 && currentSelection) {
        selections.push(currentSelection);
        currentSelection = null;
      }
      continue;
    }

    // Parse field with optional alias: fieldName or alias: fieldName
    const fieldMatch = trimmed.match(/^(?:(\w+)\s*:\s*)?(\w+)/);
    if (fieldMatch && braceCount === 0) {
      const alias = fieldMatch[1];
      const name = fieldMatch[2];

      if (currentSelection) {
        selections.push(currentSelection);
      }

      currentSelection = {
        name,
        ...(alias && { alias }),
      };
    }
  }

  if (currentSelection) {
    selections.push(currentSelection);
  }

  return selections;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate frontend GraphQL operations against backend schema
 */
export function validateGraphQLOperations(
  operations: GraphQLFrontendOperation[],
  schemas: GraphQLSchema[]
): GraphQLValidationResult[] {
  const results: GraphQLValidationResult[] = [];

  // Combine all schema operations
  const allSchemaOperations = [
    ...schemas.flatMap(s => s.queries),
    ...schemas.flatMap(s => s.mutations),
    ...schemas.flatMap(s => s.subscriptions),
  ];

  // Build type map
  const typeMap = new Map<string, GraphQLType>();
  for (const schema of schemas) {
    for (const type of schema.types) {
      typeMap.set(type.name, type);
    }
  }

  for (const operation of operations) {
    const result = validateSingleOperation(operation, allSchemaOperations, typeMap);
    results.push(result);
  }

  return results;
}

function validateSingleOperation(
  operation: GraphQLFrontendOperation,
  schemaOperations: GraphQLOperation[],
  typeMap: Map<string, GraphQLType>
): GraphQLValidationResult {
  const issues: GraphQLIssue[] = [];
  let score = 100;

  // Find matching schema operation
  const schemaOp = schemaOperations.find(op => 
    op.name === operation.name && op.type === operation.type
  );

  if (!schemaOp) {
    issues.push({
      severity: "error",
      type: "missing_operation",
      message: `Operation '${operation.name}' of type '${operation.type}' not found in schema`,
    });
    score = 0;
    return { operation, issues, score };
  }

  // Validate selections against return type
  const returnType = typeMap.get(schemaOp.returnType);
  if (returnType) {
    for (const selection of operation.selections) {
      const field = returnType.fields.find(f => f.name === selection.name);
      if (!field) {
        issues.push({
          severity: "error",
          type: "missing_field",
          message: `Field '${selection.name}' does not exist on type '${returnType.name}'`,
          field: selection.name,
        });
        score -= 20;
      }
    }
  }

  // Validate variables
  for (const variable of operation.variables) {
    const schemaArg = schemaOp.arguments?.find(a => a.name === variable.name);
    if (!schemaArg) {
      issues.push({
        severity: "warning",
        type: "unused_variable",
        message: `Variable '$${variable.name}' is not used by operation '${operation.name}'`,
        field: variable.name,
      });
      score -= 10;
    } else if (schemaArg.type !== variable.type) {
      issues.push({
        severity: "error",
        type: "type_mismatch",
        message: `Variable '$${variable.name}' type mismatch: expected '${schemaArg.type}', got '${variable.type}'`,
        field: variable.name,
        expectedType: schemaArg.type,
        actualType: variable.type,
      });
      score -= 15;
    }
  }

  // Check for missing required arguments
  for (const arg of schemaOp.arguments || []) {
    if (arg.required) {
      const provided = operation.variables.find(v => v.name === arg.name);
      if (!provided) {
        issues.push({
          severity: "error",
          type: "missing_field",
          message: `Required argument '${arg.name}' is missing`,
          field: arg.name,
        });
        score -= 20;
      }
    }
  }

  return {
    operation,
    schemaOperation: schemaOp,
    issues,
    score: Math.max(0, score),
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Extract complete GraphQL context from project
 */
export async function extractGraphQLContext(
  projectPath: string
): Promise<GraphQLContext> {
  const context: GraphQLContext = {
    schemas: [],
    frontendOperations: [],
    validationResults: [],
    unmatchedOperations: [],
  };

  // Find schema files
  const schemaFiles = await glob("**/*.{graphql,gql}", { cwd: projectPath });
  
  for (const file of schemaFiles) {
    const fullPath = path.join(projectPath, file);
    const schema = await extractGraphQLSchema(fullPath);
    if (schema) {
      context.schemas.push(schema);
    }
  }

  // Find frontend files with GraphQL operations
  const frontendFiles = await glob("**/*.{ts,tsx,js,jsx}", { cwd: projectPath });
  
  for (const file of frontendFiles) {
    const fullPath = path.join(projectPath, file);
    const operations = await extractGraphQLOperations(fullPath);
    context.frontendOperations.push(...operations);
  }

  // Validate operations against schemas
  if (context.schemas.length > 0 && context.frontendOperations.length > 0) {
    context.validationResults = validateGraphQLOperations(
      context.frontendOperations,
      context.schemas
    );

    // Find unmatched operations
    context.unmatchedOperations = context.validationResults
      .filter(r => r.issues.some(i => i.type === "missing_operation"))
      .map(r => r.operation);
  }

  logger.info(
    `GraphQL context extracted: ${context.schemas.length} schemas, ` +
    `${context.frontendOperations.length} operations, ` +
    `${context.validationResults.length} validation results`
  );

  return context;
}
