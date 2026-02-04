/**
 * Dead Code Detection - False Positive Tests
 *
 * Tests for the specific false positive scenarios reported:
 * 1. Same-file usage - Types used as function parameters/return types in the same file
 * 2. Generic type parameters - Like base.extend<TestFixtures>
 * 3. Internal API usage - Types used within service objects
 * 4. Interface property types - Types used in interface definitions
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("Dead Code Detection - False Positive Prevention", () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create a temporary directory for test fixtures
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codeguardian-test-"));
  });

  afterAll(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // Increase timeout for dead code detection tests (they scan entire projects)
  jest.setTimeout(60000);

  describe("Same-file type usage", () => {
    it("should NOT flag types used as function return types in the same file", async () => {
      // Create a test file with types used as return types
      const apiFile = `
// Types defined and used in the same file
export interface ChatResponse {
  id: string;
  message: string;
  timestamp: Date;
}

export interface ConversationDetail {
  id: string;
  messages: ChatResponse[];
}

// Functions that USE these types as return types
export function sendMessage(text: string): ChatResponse {
  return { id: '1', message: text, timestamp: new Date() };
}

export function getConversation(id: string): ConversationDetail {
  return { id, messages: [] };
}

export function startNewConversation(): ConversationDetail {
  return { id: 'new', messages: [] };
}
`;

      await fs.writeFile(path.join(tempDir, "chatApi.ts"), apiFile);
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test", dependencies: {} }),
      );

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);

      // ChatResponse and ConversationDetail should NOT be flagged as dead code
      // because they're used as return types in the same file
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      expect(deadCodeNames).not.toContain("ChatResponse");
      expect(deadCodeNames).not.toContain("ConversationDetail");
    });

    it("should NOT flag types used as function parameter types in the same file", async () => {
      const apiFile = `
export interface ReviewReject {
  reviewId: string;
  reason: string;
}

export interface ReviewRejectResponse {
  success: boolean;
  reviewId: string;
}

// Function that uses ReviewReject as parameter type
export function rejectReview(data: ReviewReject): ReviewRejectResponse {
  return { success: true, reviewId: data.reviewId };
}
`;

      await fs.writeFile(path.join(tempDir, "reviewApi.ts"), apiFile);

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      expect(deadCodeNames).not.toContain("ReviewReject");
      expect(deadCodeNames).not.toContain("ReviewRejectResponse");
    });
  });

  describe("Generic type parameters", () => {
    it("should NOT flag types used in generic parameters like base.extend<T>", async () => {
      const testFile = `
import { test as base } from '@playwright/test';

// Type used in generic parameter
export interface TestFixtures {
  page: any;
  context: any;
}

// Usage: base.extend<TestFixtures>
export const test = base.extend<TestFixtures>({
  page: async ({}, use) => {
    await use({});
  },
  context: async ({}, use) => {
    await use({});
  },
});
`;

      await fs.writeFile(path.join(tempDir, "fixtures.ts"), testFile);
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          devDependencies: { "@playwright/test": "^1.0.0" },
        }),
      );

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      // TestFixtures is used in base.extend<TestFixtures>, should NOT be flagged
      expect(deadCodeNames).not.toContain("TestFixtures");
    });

    it("should NOT flag types used in Promise<T> return types", async () => {
      const apiFile = `
export interface ActiveDeliverablesResponse {
  deliverables: any[];
  total: number;
}

export const planningApi = {
  getActiveDeliverables: async (): Promise<ActiveDeliverablesResponse> => {
    return { deliverables: [], total: 0 };
  }
};
`;

      await fs.writeFile(path.join(tempDir, "planningApi.ts"), apiFile);

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      expect(deadCodeNames).not.toContain("ActiveDeliverablesResponse");
    });
  });

  describe("Interface property types", () => {
    it("should NOT flag types used as property types in other interfaces", async () => {
      const typesFile = `
// ActiveDeliverable is used inside ActiveProject
export interface ActiveDeliverable {
  id: string;
  name: string;
  status: string;
}

export interface ActiveProject {
  id: string;
  name: string;
  deliverables: ActiveDeliverable[];  // Uses ActiveDeliverable
}

// This function uses ActiveProject
export function getActiveProjects(): ActiveProject[] {
  return [];
}
`;

      await fs.writeFile(path.join(tempDir, "types.ts"), typesFile);

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      // ActiveDeliverable is used in ActiveProject.deliverables
      expect(deadCodeNames).not.toContain("ActiveDeliverable");
      expect(deadCodeNames).not.toContain("ActiveProject");
    });
  });

  describe("API service object internal types", () => {
    it("should NOT flag types used within exported API objects", async () => {
      const apiFile = `
// Types used internally by the API object
export interface SubscriptionCreate {
  planId: string;
  userId: string;
}

export interface SubscriptionCancel {
  subscriptionId: string;
  reason?: string;
}

// API object that uses these types
export const subscriptionsApi = {
  subscribe: async (data: SubscriptionCreate) => {
    return { success: true };
  },
  cancel: async (data: SubscriptionCancel) => {
    return { success: true };
  }
};
`;

      await fs.writeFile(path.join(tempDir, "subscriptionsApi.ts"), apiFile);

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      expect(deadCodeNames).not.toContain("SubscriptionCreate");
      expect(deadCodeNames).not.toContain("SubscriptionCancel");
    });

    it("should NOT flag API objects that are imported and used elsewhere", async () => {
      // Create the API file
      const apiFile = `
export const timeEntriesApi = {
  getAll: async () => [],
  create: async (data: any) => data,
};
`;
      await fs.writeFile(path.join(tempDir, "timeEntriesApi.ts"), apiFile);

      // Create a file that imports and uses the API
      const consumerFile = `
import { timeEntriesApi } from './timeEntriesApi';

export async function loadTimeEntries() {
  return await timeEntriesApi.getAll();
}
`;
      await fs.writeFile(path.join(tempDir, "TimeEntryCard.tsx"), consumerFile);

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      // timeEntriesApi is imported and used, should NOT be flagged
      expect(deadCodeNames).not.toContain("timeEntriesApi");
    });
  });

  describe("Template/utility function types", () => {
    it("should NOT flag types used in utility functions", async () => {
      const utilFile = `
export interface TemplateUse {
  templateId: string;
  variables: Record<string, string>;
}

export function useTemplate(data: TemplateUse): string {
  return \`Template \${data.templateId}\`;
}
`;

      await fs.writeFile(path.join(tempDir, "templateUtils.ts"), utilFile);

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      expect(deadCodeNames).not.toContain("TemplateUse");
    });
  });

  describe("Statistics types", () => {
    it("should NOT flag types used as return types in API methods", async () => {
      const statsFile = `
export interface ReviewStatistics {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
}

export interface BulkReviewResponse {
  processed: number;
  failed: number;
  results: any[];
}

export const reviewApi = {
  getStatistics: async (): Promise<ReviewStatistics> => {
    return { total: 0, approved: 0, rejected: 0, pending: 0 };
  },
  bulkSubmitReviews: async (ids: string[]): Promise<BulkReviewResponse> => {
    return { processed: ids.length, failed: 0, results: [] };
  }
};
`;

      await fs.writeFile(path.join(tempDir, "reviewApi.ts"), statsFile);

      const result = await validateCodeTool.handler({
        projectPath: tempDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeNames = parsed.deadCode?.map((d: any) => d.name) || [];

      expect(deadCodeNames).not.toContain("ReviewStatistics");
      expect(deadCodeNames).not.toContain("BulkReviewResponse");
    });
  });

  describe("Method usage through parent object", () => {
    it("should NOT flag methods on exported objects when parent is used via method reference", async () => {
      // Create a minimal test project
      const testDir = path.join(tempDir, "method-usage-test");
      await fs.mkdir(testDir, { recursive: true });

      // API file with exported object containing methods
      const apiFile = `
export const paymentsApi = {
  getPaymentMethods: async (): Promise<any[]> => {
    return [];
  },
  getActivePaymentMethods: async (): Promise<any[]> => {
    return [];
  }
};
`;
      await fs.writeFile(path.join(testDir, "payments.ts"), apiFile);

      // Consumer file that uses methods from the API object
      const consumerFile = `
import { paymentsApi } from './payments';

export function usePayments() {
  return {
    queryKey: ['payment-methods'],
    queryFn: paymentsApi.getPaymentMethods,
  };
}

export function useActivePayments() {
  return {
    queryKey: ['active-payment-methods'],
    queryFn: paymentsApi.getActivePaymentMethods,
  };
}
`;
      await fs.writeFile(path.join(testDir, "usePayments.ts"), consumerFile);

      // Add a minimal package.json
      await fs.writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({
          name: "test",
          version: "1.0.0",
        }),
      );

      const result = await validateCodeTool.handler({
        projectPath: testDir,
        language: "typescript",
        checkDeadCode: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      const deadCodeIssues = parsed.deadCode || [];
      const deadCodeNames = deadCodeIssues.map((d: any) => d.name);

      // Methods should NOT be flagged as dead code since parent object is used
      expect(deadCodeNames).not.toContain("getPaymentMethods");
      expect(deadCodeNames).not.toContain("getActivePaymentMethods");
    }, 30000); // 30 second timeout
  });
});
