
import { preventHallucinationsTool } from '../../src/tools/preventHallucinations';
import { describe, expect, test } from '@jest/globals';

const PYTHON_CODE = `
import json
import os
import sys

def main():
    print(json.dumps({"a": 1}))
    # os is unused
    # sys is unused
`;

const TS_CODE = `
import { readFileSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';

function main() {
  const content = readFileSync('test.txt', 'utf8');
  // join is unused
  // inspect is unused
}
`;

describe('Unused Import Detection', () => {
  test('should detect unused imports in Python', async () => {
    const result = await preventHallucinationsTool.handler({
      codebase: PYTHON_CODE,
      newCode: PYTHON_CODE,
      language: 'python',
      options: { checkImportConsistency: true }
    });

    const content = JSON.parse(result.content[0].text);
    const unusedImports = content.issues.filter((i: any) => i.type === 'unusedImport');
    
    expect(unusedImports).toHaveLength(2);
    expect(unusedImports.map((i: any) => i.message)).toContain("Import 'os' is defined but never used");
    expect(unusedImports.map((i: any) => i.message)).toContain("Import 'sys' is defined but never used");
    
    // json should NOT be reported
    expect(unusedImports.find((i: any) => i.message.includes("'json'"))).toBeUndefined();
  });

  test('should detect unused imports in TypeScript', async () => {
    const result = await preventHallucinationsTool.handler({
      codebase: TS_CODE,
      newCode: TS_CODE,
      language: 'typescript',
      options: { checkImportConsistency: true }
    });

    const content = JSON.parse(result.content[0].text);
    const unusedImports = content.issues.filter((i: any) => i.type === 'unusedImport');
    
    expect(unusedImports).toHaveLength(2);
    expect(unusedImports.map((i: any) => i.message)).toContain("Import 'join' is defined but never used");
    expect(unusedImports.map((i: any) => i.message)).toContain("Import 'inspect' is defined but never used");

    // readFileSync should NOT be reported
    expect(unusedImports.find((i: any) => i.message.includes("'readFileSync'"))).toBeUndefined();
  });
});
