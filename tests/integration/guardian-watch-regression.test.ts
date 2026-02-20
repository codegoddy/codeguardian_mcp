import { describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { AutoValidator } from "../../src/agent/autoValidator.js";

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function cleanupTempDir(root: string): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.rm(root, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === maxAttempts) return;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
}

describe("watch mode regression", () => {
  it(
    "does not emit stale per-file alerts when a newer change version exists",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeguardian-watch-stale-"));

      let guardian: AutoValidator | undefined;
      const targetFile = path.join(root, "src/index.ts");

      try {
        await writeFile(
          path.join(root, "package.json"),
          JSON.stringify({ name: "stale-regression", private: true, dependencies: {} }),
        );

        await writeFile(
          targetFile,
          `export function run() {
  // @ts-ignore
  metricsService.recordHeartbeat("stale-check");
}
`,
        );

        const alerts: any[] = [];
        guardian = new AutoValidator(root, "typescript", "strict", "StaleRegression");
        guardian.setAlertHandler((alert) => alerts.push(alert));

        (guardian as any).fileChangeVersions.set(targetFile, 2);
        (guardian as any).fileValidationVersions.set(targetFile, 2);

        await (guardian as any).validateFile(targetFile, false, 1);
        expect(alerts.length).toBe(0);

        await (guardian as any).validateFile(targetFile, false, 2);
        const fileAlert = alerts.find((a) => a.file === "src/index.ts");
        expect(fileAlert).toBeTruthy();
        expect(fileAlert.issues.length).toBeGreaterThan(0);
      } finally {
        if (guardian) {
          try {
            guardian.stop();
          } catch {
            // ignore cleanup errors
          }
        }
        await cleanupTempDir(root);
      }
    },
    60_000,
  );

  it(
    "reports hallucinations and triggers API contract scan on API file change",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeguardian-watch-"));

      let guardian: AutoValidator | undefined;

      const controllerPath = path.join(
        root,
        "backend/src/controllers/pantryController.ts",
      );

      try {
        await writeFile(
          path.join(root, "frontend/package.json"),
          JSON.stringify({ name: "frontend", private: true, dependencies: { react: "1.0.0" } }),
        );

        await writeFile(
          path.join(root, "backend/package.json"),
          JSON.stringify({ name: "backend", private: true, dependencies: { express: "1.0.0" } }),
        );

        // Frontend service calls an endpoint that the backend does NOT define.
        await writeFile(
          path.join(root, "frontend/src/services/api.ts"),
          `async function fetchApi(endpoint: string, options?: RequestInit) {
  return fetch(endpoint, options);
}

export async function getShoppingRecommendations() {
  return fetchApi("/shopping/recommendations");
}
`,
        );

        // Backend has an unrelated route so API contract extraction has something to compare against.
        await writeFile(
          path.join(root, "backend/src/routes/pantryRoutes.ts"),
          `import { Router } from "express";

const router = Router();
router.get("/stats", (_req, res) => res.json({ ok: true }));

export default router;
`,
        );

        await writeFile(
          path.join(root, "backend/src/server.ts"),
          `import express from "express";
import pantryRoutes from "./routes/pantryRoutes";

const app = express();
app.use("/api/pantry", pantryRoutes);
app.listen(3000);
`,
        );

        await writeFile(
          controllerPath,
          `export async function getPantryStats() {
  return { ok: true };
}
`,
        );

        const alerts: any[] = [];
        guardian = new AutoValidator(root, "typescript", "strict", "WatchRegression");
        guardian.setAlertHandler((alert) => alerts.push(alert));

        await guardian.start();
        alerts.length = 0;

        // Simulate a watch-mode edit by injecting a hallucinated method call.
        const updatedController = `export async function getPantryStats() {
  // @ts-ignore
  metricsService.recordHeartbeat("watch-regression");
  return { ok: true };
}
`;
        await fs.writeFile(controllerPath, updatedController, "utf8");

        // Avoid relying on file-watcher timing; call the watch-mode validation method directly.
        await (guardian as any).validateFile(controllerPath);

        const controllerAlert = alerts.find(
          (a) => a.file === "backend/src/controllers/pantryController.ts",
        );
        expect(controllerAlert).toBeTruthy();

        const hasHallucination = controllerAlert.issues.some(
          (i: any) =>
            i.type !== "deadCode" &&
            i.type !== "unusedExport" &&
            i.type !== "unusedFunction" &&
            i.type !== "orphanedFile",
        );
        expect(hasHallucination).toBe(true);

        const apiContractAlert = alerts.find(
          (a) => typeof a.file === "string" && a.file.startsWith("API_CONTRACT_SCAN"),
        );
        expect(apiContractAlert).toBeTruthy();
        expect(apiContractAlert.issues.length).toBeGreaterThan(0);
        expect(apiContractAlert.llmMessage).toContain("WatchRegression: API Contract Validation");

      } finally {
        if (guardian) {
          try {
            await guardian.stop();
          } catch {
            // ignore cleanup errors
          }
        }
        await cleanupTempDir(root);
      }
    },
    60_000,
  );

  it(
    "triggers API contract scan when schema/model files change",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeguardian-watch-schema-"));
      let guardian: AutoValidator | undefined;

      const schemaPath = path.join(root, "backend/src/schemas/userSchema.ts");

      try {
        await writeFile(
          path.join(root, "frontend/package.json"),
          JSON.stringify({ name: "frontend", private: true, dependencies: { react: "1.0.0" } }),
        );

        await writeFile(
          path.join(root, "backend/package.json"),
          JSON.stringify({ name: "backend", private: true, dependencies: { express: "1.0.0" } }),
        );

        // Frontend calls an endpoint backend does not define (ensures scan yields at least one issue)
        await writeFile(
          path.join(root, "frontend/src/services/api.ts"),
          `export async function getBillingOverview() {
  return fetch('/api/billing/overview').then((r) => r.json());
}
`,
        );

        await writeFile(
          path.join(root, "backend/src/server.ts"),
          `import express from "express";
const app = express();
app.get("/api/other", (_req, res) => res.json({ ok: true }));
`,
        );

        await writeFile(
          schemaPath,
          `export interface UserSchema {
  id: string;
  email: string;
}
`,
        );

        const alerts: any[] = [];
        guardian = new AutoValidator(root, "typescript", "strict", "SchemaTriggerRegression");
        guardian.setAlertHandler((alert) => alerts.push(alert));

        await guardian.start();
        alerts.length = 0;

        await fs.writeFile(
          schemaPath,
          `export interface UserSchema {
  id: string;
  email: string;
  status: string;
}
`,
          "utf8",
        );

        // Validate directly to avoid watcher timing flake in CI
        await (guardian as any).validateFile(schemaPath);

        const apiContractAlert = alerts.find(
          (a) => typeof a.file === "string" && a.file.startsWith("API_CONTRACT_SCAN"),
        );
        expect(apiContractAlert).toBeTruthy();
        expect(apiContractAlert.issues.length).toBeGreaterThan(0);
        expect(apiContractAlert.llmMessage).toContain("SchemaTriggerRegression: API Contract Validation");
      } finally {
        if (guardian) {
          try {
            await guardian.stop();
          } catch {
            // ignore cleanup errors
          }
        }
        await cleanupTempDir(root);
      }
    },
    60_000,
  );
});
