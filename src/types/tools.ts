/**
 * Type definitions for CodeGuardian tools
 */

export interface ToolDefinition {
  definition: {
    name: string;
    description: string;
    inputSchema: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
  handler: (args: any) => Promise<any>;
}

export interface SymbolTable {
  functions: string[];
  classes: string[];
  interfaces?: string[];
  variables: string[];
  imports: string[];
  dependencies?: string[];
}

export interface Issue {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  line: number;
  column: number;
  code?: string;
  suggestion?: string;
  autoFixable?: boolean;
  confidence?: number;
}

export interface SessionHistoryEntry {
  timestamp: string;
  code: string;
  context: string;
}
