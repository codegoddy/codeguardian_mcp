import { test as base, expect, Page } from '@playwright/test';

export interface TestFixtures {
  authenticatedPage: Page;
  testUser: {
    email: string;
    password: string;
    name: string;
  };
  testClient: {
    name: string;
    email: string;
    company: string;
  };
  testProject: {
    name: string;
    description: string;
    budget: number;
    hourlyRate: number;
  };
}

export const test = base.extend<TestFixtures>({
  testUser: [
    {
      email: 'e2e-test-user@example.com',
      password: 'SecureP@ssw0rd!123',
      name: 'E2E Test User',
    },
    { option: true },
  ],
  testClient: [
    {
      name: 'Test Client Corp',
      email: 'contact@testclientcorp.com',
      company: 'Test Client Corporation',
    },
    { option: true },
  ],
  testProject: [
    {
      name: 'E2E Test Project',
      description: 'Project created by E2E tests',
      budget: 10000,
      hourlyRate: 150,
    },
    { option: true },
  ],
  authenticatedPage: async ({ page, testUser }, use) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login|DevHQ/);

    try {
      await page.fill('input[type="email"], input[name="email"], input[id*="email"]', testUser.email);
      await page.fill('input[type="password"], input[name="password"], input[id*="password"]', testUser.password);

      const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
      await loginButton.click();

      await page.waitForURL(/\/(dashboard|projects|clients)\/?/, { timeout: 10000 }).catch(() => {});
    } catch {
      console.log('Authentication may have failed or user needs to login manually');
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };
