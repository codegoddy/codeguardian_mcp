/**
 * Global test setup
 * Runs before each test to ensure clean state
 *
 * @format
 */

import { clearContextCache } from "../src/context/projectContext.js";
import { clearDeadCodeCaches } from "../src/tools/validation/deadCode.js";

// Clear all caches before each test to prevent test interference
beforeEach(() => {
  clearContextCache();
  clearDeadCodeCaches();
});
