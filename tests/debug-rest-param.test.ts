/** @format */

import { extractSymbolsAST } from "../src/tools/validation/extractors/index.js";

const code = `
export function cn(...inputs: ClassValue[]) {
  return inputs;
}
`;

const symbols = extractSymbolsAST(code, "typescript");
console.log("Extracted symbols:", JSON.stringify(symbols, null, 2));
