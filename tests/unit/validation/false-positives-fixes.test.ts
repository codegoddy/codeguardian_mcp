/**
 * Tests for False Positive Fixes
 *
 * These tests ensure that valid code patterns are not incorrectly flagged as hallucinations.
 * Based on findings from real-world codebase analysis.
 *
 * @format
 */

import { extractSymbolsAST, extractUsagesAST, extractImportsAST } from "../../../src/tools/validation/extractors/index.js";
import { validateSymbols } from "../../../src/tools/validation/validation.js";
import type { ASTImport, ProjectSymbol } from "../../../src/tools/validation/types.js";

describe("False Positive Fixes", () => {
  describe("Destructured Function Parameters", () => {
    it("should extract destructured parameters from function signature (useTimeTracker pattern)", () => {
      const code = `
export function useTimeTracker({
  autoConnect = true,
  autoDisconnect = true,
  initialViewMode = 'day'
}: UseTimeTrackerOptions) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  
  useEffect(() => {
    if (autoConnect) connect();
    return () => { if (autoDisconnect) disconnect(); };
  }, [autoConnect, autoDisconnect]);
  
  return { viewMode };
}
      `;

      const symbols = extractSymbolsAST(code, "test.ts", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // Should extract the function parameter variables
      expect(symbolNames).toContain("autoConnect");
      expect(symbolNames).toContain("autoDisconnect");
      expect(symbolNames).toContain("initialViewMode");
    });

    it("should extract nested destructured parameters", () => {
      const code = `
function processData({ user: { name, email }, settings: { theme } }) {
  console.log(name, email, theme);
}
      `;

      const symbols = extractSymbolsAST(code, "test.ts", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // Should extract all destructured names
      expect(symbolNames).toContain("name");
      expect(symbolNames).toContain("email");
      expect(symbolNames).toContain("theme");
    });

    it("should extract array destructured parameters", () => {
      const code = `
function processPair([first, second]: [string, number]) {
  console.log(first, second);
}
      `;

      const symbols = extractSymbolsAST(code, "test.ts", "typescript");
      const symbolNames = symbols.map(s => s.name);

      expect(symbolNames).toContain("first");
      expect(symbolNames).toContain("second");
    });

    it("should extract renamed destructured parameters", () => {
      const code = `
function mapUser({ name: userName, id: userId }) {
  return { userName, userId };
}
      `;

      const symbols = extractSymbolsAST(code, "test.ts", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // Should extract the local variable names (not the original property names)
      expect(symbolNames).toContain("userName");
      expect(symbolNames).toContain("userId");
    });

    it("should extract parameters with default values in destructuring", () => {
      const code = `
function greet({ name = 'Anonymous', greeting = 'Hello' } = {}) {
  return \`\${greeting}, \${name}!\`;
}
      `;

      const symbols = extractSymbolsAST(code, "test.ts", "typescript");
      const symbolNames = symbols.map(s => s.name);

      expect(symbolNames).toContain("name");
      expect(symbolNames).toContain("greeting");
    });
  });

  describe("JSX Text Content", () => {
    it("should NOT extract text content from JSX as identifiers", () => {
      const code = `
function Component() {
  return (
    <div>
      <h4>Budget & Time Tracking</h4>
      <p>Settings & Configuration</p>
    </div>
  );
}
      `;

      const imports: ASTImport[] = [];
      const usages = extractUsagesAST(code, "typescript", imports);
      const usageNames = usages.map(u => u.name);

      // Should NOT include text content as usages
      expect(usageNames).not.toContain("Time");
      expect(usageNames).not.toContain("Tracking");
      expect(usageNames).not.toContain("Budget");
      expect(usageNames).not.toContain("Settings");
      expect(usageNames).not.toContain("Configuration");
    });

    it("should still extract actual variable usages in JSX expressions", () => {
      const code = `
function Component({ title, count }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count}</p>
    </div>
  );
}
      `;

      const symbols = extractSymbolsAST(code, "test.tsx", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // Should extract the props
      expect(symbolNames).toContain("title");
      expect(symbolNames).toContain("count");

      const imports: ASTImport[] = [];
      const usages = extractUsagesAST(code, "typescript", imports);
      const usageNames = usages.map(u => u.name);

      // Should still extract usages in JSX expressions
      expect(usageNames).toContain("title");
      expect(usageNames).toContain("count");
    });

    it("should handle JSX with nested elements and text", () => {
      const code = `
function Card({ header, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3>Card Header: {header}</h3>
      </div>
      <div className="card-body">
        {children}
      </div>
    </div>
  );
}
      `;

      const symbols = extractSymbolsAST(code, "test.tsx", "typescript");
      const symbolNames = symbols.map(s => s.name);

      expect(symbolNames).toContain("header");
      expect(symbolNames).toContain("children");

      const imports: ASTImport[] = [];
      const usages = extractUsagesAST(code, "typescript", imports);
      const usageNames = usages.map(u => u.name);

      // Should extract prop usage but not the static text
      expect(usageNames).toContain("header");
      expect(usageNames).toContain("children");
      expect(usageNames).not.toContain("Card");
      expect(usageNames).not.toContain("Header");
    });
  });

  describe("Component Props", () => {
    it("should extract React component props as valid variables", () => {
      const code = `
interface ModalProps {
  isOpen: boolean;
  alwaysOpen?: boolean;
  onClose: () => void;
}

function Modal({ isOpen, alwaysOpen = false, onClose }: ModalProps) {
  if (!isOpen && !alwaysOpen) return null;
  return <div onClick={onClose}>Modal Content</div>;
}
      `;

      const symbols = extractSymbolsAST(code, "test.tsx", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // All props should be extracted as local variables
      expect(symbolNames).toContain("isOpen");
      expect(symbolNames).toContain("alwaysOpen");
      expect(symbolNames).toContain("onClose");
    });

    it("should not flag alwaysOpen as undefined when it's a prop", () => {
      const code = `
function Sidebar({ alwaysOpen }: { alwaysOpen?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(alwaysOpen ?? false);
  
  useEffect(() => {
    if (alwaysOpen) {
      setIsExpanded(true);
    }
  }, [alwaysOpen]);
  
  return <aside className={alwaysOpen ? 'always-open' : ''}>Content</aside>;
}
      `;

      const symbols = extractSymbolsAST(code, "test.tsx", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // alwaysOpen should be in the symbol table
      expect(symbolNames).toContain("alwaysOpen");
    });
  });

  describe("Method Resolution on Imported Objects", () => {
    it("should validate method calls on imported API objects", () => {
      // Simulating the projectsApi.getProjects() scenario
      const newCode = `
import { projectsApi } from '@/services/projects';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.getProjects(),
  });
}
      `;

      // Simulate having projectsApi in the project symbol table with its methods
      const symbolTable: ProjectSymbol[] = [
        { name: "projectsApi", type: "variable", file: "src/services/projects.ts" },
        { name: "getProjects", type: "method", file: "src/services/projects.ts" },
        { name: "deleteProject", type: "method", file: "src/services/projects.ts" },
      ];

      const imports = extractImportsAST(newCode, "typescript");
      const usages = extractUsagesAST(newCode, "typescript", imports);

      // Run validation
      const issues = validateSymbols(
        usages,
        symbolTable,
        newCode,
        "typescript",
        false, // non-strict mode
        imports,
        new Map(), // pythonExports
        null, // context
        "src/hooks/useProjects.ts",
        new Set(), // missingPackages
      );

      // Should not flag getProjects as non-existent when it exists in the project
      const methodIssues = issues.filter(i => 
        i.type === "nonExistentMethod" && i.message.includes("getProjects")
      );
      
      expect(methodIssues.length).toBe(0);
    });

    it("should handle method chains on imported objects", () => {
      const code = `
import { api } from './api';

async function fetchData() {
  const result = await api.users.getAll().then(res => res.json());
  return result;
}
      `;

      const symbols = extractSymbolsAST(code, "test.ts", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // Should extract the function
      expect(symbolNames).toContain("fetchData");

      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      // Should have method call usages
      const methodCalls = usages.filter(u => u.type === "methodCall");
      expect(methodCalls.some(u => u.name === "getAll")).toBe(true);
      expect(methodCalls.some(u => u.name === "then")).toBe(true);
      expect(methodCalls.some(u => u.name === "json")).toBe(true);
    });
  });

  describe("Complex Real-World Patterns", () => {
    it("should handle useTimeTracker hook pattern completely", () => {
      const code = `
import { useState, useEffect } from 'react';
import { TimeEntry, UserTimeEntries } from '@/services/timeEntries';
import { PlannedTimeBlock } from '@/services/planning';

interface UseTimeTrackerOptions {
  autoConnect?: boolean;
  autoDisconnect?: boolean;
  initialViewMode?: ViewMode;
}

type ViewMode = 'day' | 'week' | 'month';

export function useTimeTracker({
  autoConnect = true,
  autoDisconnect = true,
  initialViewMode = 'day'
}: UseTimeTrackerOptions) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (autoConnect && !isConnected) {
      setIsConnected(true);
    }
    return () => {
      if (autoDisconnect && isConnected) {
        setIsConnected(false);
      }
    };
  }, [autoConnect, autoDisconnect, isConnected]);

  return {
    viewMode,
    setViewMode,
    isConnected
  };
}
      `;

      const symbols = extractSymbolsAST(code, "test.ts", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // All destructured parameters should be present
      expect(symbolNames).toContain("autoConnect");
      expect(symbolNames).toContain("autoDisconnect");
      expect(symbolNames).toContain("initialViewMode");

      // Local variables should be present
      expect(symbolNames).toContain("viewMode");
      expect(symbolNames).toContain("setViewMode");
      expect(symbolNames).toContain("isConnected");
      expect(symbolNames).toContain("setIsConnected");
    });

    it("should handle API service with multiple methods", () => {
      const code = `
import { projectsApi } from '@/services/projects';
import { useQuery, useMutation } from '@tanstack/react-query';

export function useProjects(statusFilter?: string) {
  return useQuery({
    queryKey: ['projects', statusFilter],
    queryFn: () => projectsApi.getProjects(statusFilter),
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getProject(projectId),
    enabled: !!projectId,
  });
}

export function useDeleteProject() {
  return useMutation({
    mutationFn: (projectId: string) => projectsApi.deleteProject(projectId),
  });
}
      `;

      const imports = extractImportsAST(code, "typescript");
      const importNames = imports.flatMap(i => i.names.map(n => n.local));

      // Should extract imports
      expect(importNames).toContain("projectsApi");
      expect(importNames).toContain("useQuery");
      expect(importNames).toContain("useMutation");

      const usages = extractUsagesAST(code, "typescript", imports);
      const methodCalls = usages.filter(u => u.type === "methodCall");

      // Should extract method calls
      expect(methodCalls.some(u => u.name === "getProjects")).toBe(true);
      expect(methodCalls.some(u => u.name === "getProject")).toBe(true);
      expect(methodCalls.some(u => u.name === "deleteProject")).toBe(true);
    });

    it("should NOT flag URL strings in fetch calls as variables", () => {
      const code = `
export async function generateToken() {
  const response = await fetch('/api/cli/generate-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return response.json();
}
      `;

      const imports = extractImportsAST(code, "typescript");
      const usages = extractUsagesAST(code, "typescript", imports);

      // Should extract fetch as a call
      const fetchUsage = usages.find(u => u.name === "fetch");
      expect(fetchUsage).toBeDefined();
      expect(fetchUsage?.type).toBe("call");

      // Should NOT extract the URL string as a variable reference
      const urlUsage = usages.find(u => u.name === "/api/cli/generate-token");
      expect(urlUsage).toBeUndefined();
    });

    it("should extract destructured React component props with default values in arrow functions", () => {
      const code = `
import React from 'react';

interface SelectProps {
  className?: string;
  children: React.ReactNode;
  position?: "popper" | "item-aligned";
}

export const Select = (({ className, children, position = "popper" }: SelectProps) => {
  return (
    <div className={className} data-position={position}>
      {children}
    </div>
  );
});
      `;

      const symbols = extractSymbolsAST(code, "test.tsx", "typescript");
      const symbolNames = symbols.map(s => s.name);

      // All destructured props should be present, including those with defaults
      expect(symbolNames).toContain("className");
      expect(symbolNames).toContain("children");
      expect(symbolNames).toContain("position");
      
      // Component should be present
      expect(symbolNames).toContain("Select");
    });
  });
});
