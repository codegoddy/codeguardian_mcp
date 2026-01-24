
import { validateCodeTool } from "./src/tools/validateCode.js";
import { logger } from "./src/utils/logger.js";

async function test() {
  // Create a fake project environment
  // We'll validate a snippet that imports from a non-existent file
  
  const result = await validateCodeTool.handler({
    projectPath: ".", // Current dir
    language: "javascript",
    newCode: `
      import { nonExistentFunction } from "./nonExistentFile";
      
      export function test() {
         nonExistentFunction();
      }
    `
  });
  
  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
