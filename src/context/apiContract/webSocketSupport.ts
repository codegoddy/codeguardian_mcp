/**
 * API Contract Guardian - WebSocket Support
 *
 * Extracts and validates WebSocket/Socket.io event contracts.
 * Detects mismatches between frontend and backend WebSocket event definitions.
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

export interface WebSocketEvent {
  name: string;
  direction: "client-to-server" | "server-to-client" | "bidirectional";
  payload?: WebSocketPayload;
  acknowledgement?: boolean;
  rooms?: string[];
  namespace?: string;
  file: string;
  line: number;
}

export interface WebSocketPayload {
  type: "object" | "primitive" | "array";
  schema?: Record<string, PayloadField>;
  primitiveType?: string;
  itemType?: string;
}

export interface PayloadField {
  type: string;
  required: boolean;
  description?: string;
}

export interface WebSocketNamespace {
  name: string;
  path: string;
  events: WebSocketEvent[];
  middleware?: string[];
  file: string;
  line: number;
}

export interface WebSocketServerConfig {
  framework: "socket.io" | "ws" | "uWebSockets" | "custom";
  namespaces: WebSocketNamespace[];
  globalMiddleware?: string[];
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  file: string;
  line: number;
}

export interface WebSocketClientConfig {
  framework: "socket.io-client" | "ws" | "uWebSockets" | "custom";
  serverUrl: string;
  namespace?: string;
  events: WebSocketClientEvent[];
  reconnect?: boolean;
  file: string;
  line: number;
}

export interface WebSocketClientEvent {
  name: string;
  direction: "emit" | "on" | "once";
  payloadType?: string;
  handler?: string;
  file: string;
  line: number;
}

export interface WebSocketValidationResult {
  clientEvent: WebSocketClientEvent;
  serverEvent?: WebSocketEvent;
  issues: WebSocketIssue[];
  score: number;
}

export interface WebSocketIssue {
  severity: "error" | "warning" | "info";
  type: "missing_event" | "direction_mismatch" | "payload_mismatch" | "namespace_mismatch";
  message: string;
  eventName?: string;
  expectedDirection?: string;
  actualDirection?: string;
  line?: number;
}

export interface WebSocketContext {
  serverConfigs: WebSocketServerConfig[];
  clientConfigs: WebSocketClientConfig[];
  validationResults: WebSocketValidationResult[];
  unmatchedClientEvents: WebSocketClientEvent[];
  unmatchedServerEvents: WebSocketEvent[];
}

// ============================================================================
// Server-side Extraction
// ============================================================================

/**
 * Extract WebSocket server configuration from backend files
 */
export async function extractWebSocketServerConfig(filePath: string): Promise<WebSocketServerConfig | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");

    // Detect framework
    const framework = detectWebSocketFramework(content);
    if (!framework) return null;

    if (framework === "socket.io") {
      return extractSocketIOServerConfig(content, filePath);
    } else if (framework === "ws") {
      return extractWSServerConfig(content, filePath);
    }

    return null;
  } catch (err) {
    logger.debug(`Failed to extract WebSocket server config from ${filePath}: ${err}`);
    return null;
  }
}

function detectWebSocketFramework(content: string): WebSocketServerConfig["framework"] | null {
  if (content.includes("socket.io") || content.includes("io.on(")) {
    return "socket.io";
  }
  if (content.includes("require('ws')") || content.includes('require("ws")') || content.includes("new WebSocketServer")) {
    return "ws";
  }
  if (content.includes("uWebSockets") || content.includes("App()")) {
    return "uWebSockets";
  }
  return null;
}

function extractSocketIOServerConfig(content: string, filePath: string): WebSocketServerConfig | null {
  const config: WebSocketServerConfig = {
    framework: "socket.io",
    namespaces: [],
    file: filePath,
    line: 1,
  };

  const lines = content.split("\n");

  // Find io initialization
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: io.on('connection', ...)
    const connectionMatch = line.match(/io\.on\(['"](\w+)['"]/);
    if (connectionMatch) {
      const namespace: WebSocketNamespace = {
        name: "/",
        path: "/",
        events: [],
        file: filePath,
        line: i + 1,
      };

      // Extract events from the connection handler
      const events = extractSocketIOEvents(content, i);
      namespace.events.push(...events);

      config.namespaces.push(namespace);
    }

    // Match: io.of('/namespace').on('connection', ...)
    const namespaceMatch = line.match(/io\.of\(['"]([^'"]+)['"]\)/);
    if (namespaceMatch) {
      const namespaceName = namespaceMatch[1];
      const namespace: WebSocketNamespace = {
        name: namespaceName,
        path: namespaceName,
        events: [],
        file: filePath,
        line: i + 1,
      };

      const events = extractSocketIOEvents(content, i);
      namespace.events.push(...events);

      config.namespaces.push(namespace);
    }
  }

  return config.namespaces.length > 0 ? config : null;
}

function extractSocketIOEvents(content: string, startLine: number): WebSocketEvent[] {
  const events: WebSocketEvent[] = [];
  const lines = content.split("\n");

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    // Match: socket.on('eventName', ...)
    const onMatch = line.match(/socket\.on\(['"]([^'"]+)['"]/);
    if (onMatch) {
      events.push({
        name: onMatch[1],
        direction: "client-to-server",
        file: "server",
        line: i + 1,
      });
    }

    // Match: socket.emit('eventName', ...)
    const emitMatch = line.match(/socket\.emit\(['"]([^'"]+)['"]/);
    if (emitMatch) {
      events.push({
        name: emitMatch[1],
        direction: "server-to-client",
        file: "server",
        line: i + 1,
      });
    }

    // Break if we hit another connection handler
    if (line.includes("io.on(") || line.includes("io.of(")) {
      break;
    }
  }

  return events;
}

function extractWSServerConfig(content: string, filePath: string): WebSocketServerConfig | null {
  const config: WebSocketServerConfig = {
    framework: "ws",
    namespaces: [],
    file: filePath,
    line: 1,
  };

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: wss.on('connection', ...)
    if (line.match(/wss?\.on\(['"]connection['"]/)) {
      const namespace: WebSocketNamespace = {
        name: "/",
        path: "/",
        events: [],
        file: filePath,
        line: i + 1,
      };

      // Extract message handlers
      const events = extractWSEvents(content, i);
      namespace.events.push(...events);

      config.namespaces.push(namespace);
    }
  }

  return config.namespaces.length > 0 ? config : null;
}

function extractWSEvents(content: string, startLine: number): WebSocketEvent[] {
  const events: WebSocketEvent[] = [];
  const lines = content.split("\n");

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    // Match: ws.on('message', ...)
    const messageMatch = line.match(/ws\.on\(['"](\w+)['"]/);
    if (messageMatch) {
      events.push({
        name: messageMatch[1],
        direction: "client-to-server",
        file: "server",
        line: i + 1,
      });
    }

    // Match: ws.send(...)
    if (line.includes("ws.send(")) {
      events.push({
        name: "message",
        direction: "server-to-client",
        file: "server",
        line: i + 1,
      });
    }

    // Break if we hit another connection handler
    if (line.match(/wss?\.on\(['"]connection['"]/)) {
      break;
    }
  }

  return events;
}

// ============================================================================
// Client-side Extraction
// ============================================================================

/**
 * Extract WebSocket client configuration from frontend files
 */
export async function extractWebSocketClientConfig(filePath: string): Promise<WebSocketClientConfig | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");

    // Detect framework
    const framework = detectWebSocketClientFramework(content);
    if (!framework) return null;

    if (framework === "socket.io-client") {
      return extractSocketIOClientConfig(content, filePath);
    } else if (framework === "ws") {
      return extractWSClientConfig(content, filePath);
    }

    return null;
  } catch (err) {
    logger.debug(`Failed to extract WebSocket client config from ${filePath}: ${err}`);
    return null;
  }
}

function detectWebSocketClientFramework(content: string): WebSocketClientConfig["framework"] | null {
  if (content.includes("socket.io-client") || content.includes("io(")) {
    return "socket.io-client";
  }
  if (content.includes("new WebSocket(") || content.includes("new WebSocket(")) {
    return "ws";
  }
  return null;
}

function extractSocketIOClientConfig(content: string, filePath: string): WebSocketClientConfig | null {
  const config: WebSocketClientConfig = {
    framework: "socket.io-client",
    serverUrl: "",
    events: [],
    file: filePath,
    line: 1,
  };

  try {
    const parser = getParser("typescript");
    const tree = parser.parse(content);

    function traverse(node: any) {
      if (!node) return;

      // Look for call expressions (io('url'), socket.on(), socket.emit())
      if (node.type === "call_expression") {
        const functionNode = node.childForFieldName("function");
        if (functionNode) {
          const funcText = content.slice(functionNode.startIndex, functionNode.endIndex);
          const line = node.startPosition.row + 1;

          // Match: io('url') - socket initialization
          if (funcText.match(/^io\s*$/)) {
            const argsNode = node.childForFieldName("arguments");
            if (argsNode && argsNode.children.length > 0) {
              const firstArg = argsNode.children[0];
              if (firstArg.type === "string") {
                config.serverUrl = content.slice(firstArg.startIndex, firstArg.endIndex).replace(/['"]/g, "");
              }
            }
          }

          // Match: socket.on('event', ...)
          if (funcText.match(/socket\.on$/)) {
            const argsNode = node.childForFieldName("arguments");
            if (argsNode && argsNode.children.length > 0) {
              const firstArg = argsNode.children[0];
              if (firstArg.type === "string") {
                const eventName = content.slice(firstArg.startIndex, firstArg.endIndex).replace(/['"]/g, "");
                config.events.push({
                  name: eventName,
                  direction: "on",
                  file: filePath,
                  line,
                });
              }
            }
          }

          // Match: socket.emit('event', ...)
          if (funcText.match(/socket\.emit$/)) {
            const argsNode = node.childForFieldName("arguments");
            if (argsNode && argsNode.children.length > 0) {
              const firstArg = argsNode.children[0];
              if (firstArg.type === "string") {
                const eventName = content.slice(firstArg.startIndex, firstArg.endIndex).replace(/['"]/g, "");
                config.events.push({
                  name: eventName,
                  direction: "emit",
                  file: filePath,
                  line,
                });
              }
            }
          }

          // Match: socket.once('event', ...)
          if (funcText.match(/socket\.once$/)) {
            const argsNode = node.childForFieldName("arguments");
            if (argsNode && argsNode.children.length > 0) {
              const firstArg = argsNode.children[0];
              if (firstArg.type === "string") {
                const eventName = content.slice(firstArg.startIndex, firstArg.endIndex).replace(/['"]/g, "");
                config.events.push({
                  name: eventName,
                  direction: "once",
                  file: filePath,
                  line,
                });
              }
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

  return config.events.length > 0 ? config : null;
}

function extractWSClientConfig(content: string, filePath: string): WebSocketClientConfig | null {
  const config: WebSocketClientConfig = {
    framework: "ws",
    serverUrl: "",
    events: [],
    file: filePath,
    line: 1,
  };

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: new WebSocket('url')
    const wsMatch = line.match(/new\s+WebSocket\(['"]([^'"]+)['"]\)/);
    if (wsMatch) {
      config.serverUrl = wsMatch[1];
    }

    // Match: ws.onmessage = ...
    if (line.includes("ws.onmessage") || line.match(/ws\.on\(['"]message['"]/)) {
      config.events.push({
        name: "message",
        direction: "on",
        file: filePath,
        line: i + 1,
      });
    }

    // Match: ws.send(...)
    if (line.includes("ws.send(")) {
      config.events.push({
        name: "message",
        direction: "emit",
        file: filePath,
        line: i + 1,
      });
    }
  }

  return config.events.length > 0 ? config : null;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate WebSocket client events against server configuration
 */
export function validateWebSocketContracts(
  clientConfigs: WebSocketClientConfig[],
  serverConfigs: WebSocketServerConfig[]
): WebSocketValidationResult[] {
  const results: WebSocketValidationResult[] = [];

  // Flatten all server events
  const allServerEvents: WebSocketEvent[] = [];
  for (const serverConfig of serverConfigs) {
    for (const namespace of serverConfig.namespaces) {
      allServerEvents.push(...namespace.events);
    }
  }

  // Validate each client event
  for (const clientConfig of clientConfigs) {
    for (const clientEvent of clientConfig.events) {
      const result = validateClientEvent(clientEvent, allServerEvents);
      results.push(result);
    }
  }

  return results;
}

function validateClientEvent(
  clientEvent: WebSocketClientEvent,
  serverEvents: WebSocketEvent[]
): WebSocketValidationResult {
  const issues: WebSocketIssue[] = [];
  let score = 100;

  // Find matching server event
  const serverEvent = serverEvents.find(e => e.name === clientEvent.name);

  if (!serverEvent) {
    issues.push({
      severity: "error",
      type: "missing_event",
      message: `Event '${clientEvent.name}' is not defined on the server`,
      eventName: clientEvent.name,
    });
    score = 0;
    return { clientEvent, issues, score };
  }

  // Validate direction
  const expectedDirection = getExpectedDirection(clientEvent.direction);
  if (serverEvent.direction !== expectedDirection && serverEvent.direction !== "bidirectional") {
    issues.push({
      severity: "error",
      type: "direction_mismatch",
      message: `Event '${clientEvent.name}' direction mismatch: client ${clientEvent.direction} but server expects ${serverEvent.direction}`,
      eventName: clientEvent.name,
      expectedDirection: serverEvent.direction,
      actualDirection: expectedDirection,
    });
    score -= 30;
  }

  return {
    clientEvent,
    serverEvent,
    issues,
    score: Math.max(0, score),
  };
}

function getExpectedDirection(clientDirection: WebSocketClientEvent["direction"]): WebSocketEvent["direction"] {
  switch (clientDirection) {
    case "emit":
      return "client-to-server";
    case "on":
    case "once":
      return "server-to-client";
    default:
      return "bidirectional";
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Extract complete WebSocket context from project
 */
export async function extractWebSocketContext(
  projectPath: string
): Promise<WebSocketContext> {
  const context: WebSocketContext = {
    serverConfigs: [],
    clientConfigs: [],
    validationResults: [],
    unmatchedClientEvents: [],
    unmatchedServerEvents: [],
  };

  // Find server files
  const serverFiles = await glob("**/*.{ts,js,py}", { cwd: projectPath });
  
  for (const file of serverFiles) {
    const fullPath = path.join(projectPath, file);
    const config = await extractWebSocketServerConfig(fullPath);
    if (config) {
      context.serverConfigs.push(config);
    }
  }

  // Find client files
  const clientFiles = await glob("**/*.{ts,tsx,js,jsx}", { cwd: projectPath });
  
  for (const file of clientFiles) {
    const fullPath = path.join(projectPath, file);
    const config = await extractWebSocketClientConfig(fullPath);
    if (config) {
      context.clientConfigs.push(config);
    }
  }

  // Validate if we have both client and server configs
  if (context.clientConfigs.length > 0 && context.serverConfigs.length > 0) {
    context.validationResults = validateWebSocketContracts(
      context.clientConfigs,
      context.serverConfigs
    );

    // Find unmatched events
    context.unmatchedClientEvents = context.validationResults
      .filter(r => r.issues.some(i => i.type === "missing_event"))
      .map(r => r.clientEvent);
  }

  logger.info(
    `WebSocket context extracted: ${context.serverConfigs.length} server configs, ` +
    `${context.clientConfigs.length} client configs, ` +
    `${context.validationResults.length} validation results`
  );

  return context;
}
