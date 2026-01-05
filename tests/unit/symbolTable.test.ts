/**
 * Unit tests for Symbol Table Builder
 */

import { buildSymbolTable } from '../../src/analyzers/symbolTable';

describe('Symbol Table Builder', () => {
  describe('JavaScript/TypeScript', () => {
    it('should extract function declarations', async () => {
      const code = `
        function myFunction() {}
        const arrowFunc = () => {};
        const funcExpr = function() {};
      `;

      const symbolTable = await buildSymbolTable(code, 'javascript');

      expect(symbolTable.functions).toContain('myFunction');
      expect(symbolTable.functions).toContain('arrowFunc');
      expect(symbolTable.functions).toContain('funcExpr');
    });

    it('should extract class declarations', async () => {
      const code = `
        class MyClass {}
        class AnotherClass extends MyClass {}
      `;

      const symbolTable = await buildSymbolTable(code, 'javascript');

      expect(symbolTable.classes).toContain('MyClass');
      expect(symbolTable.classes).toContain('AnotherClass');
    });

    it('should extract imports', async () => {
      const code = `
        import React from 'react';
        import { useState } from 'react';
        const fs = require('fs');
      `;

      const symbolTable = await buildSymbolTable(code, 'javascript');

      expect(symbolTable.imports).toContain('react');
      expect(symbolTable.imports).toContain('fs');
    });

    it('should extract variable declarations', async () => {
      const code = `
        const myVar = 10;
        let anotherVar = 'test';
        var oldVar = true;
      `;

      const symbolTable = await buildSymbolTable(code, 'javascript');

      expect(symbolTable.variables).toContain('myVar');
      expect(symbolTable.variables).toContain('anotherVar');
      expect(symbolTable.variables).toContain('oldVar');
    });
  });

  describe('Python', () => {
    it('should extract function definitions', async () => {
      const code = `
def my_function():
    pass

def another_function(param):
    return param
      `;

      const symbolTable = await buildSymbolTable(code, 'python');

      expect(symbolTable.functions).toContain('my_function');
      expect(symbolTable.functions).toContain('another_function');
    });

    it('should extract class definitions', async () => {
      const code = `
class MyClass:
    pass

class AnotherClass(MyClass):
    pass
      `;

      const symbolTable = await buildSymbolTable(code, 'python');

      expect(symbolTable.classes).toContain('MyClass');
      expect(symbolTable.classes).toContain('AnotherClass');
    });

    it('should extract imports', async () => {
      const code = `
import os
import sys
from pathlib import Path
      `;

      const symbolTable = await buildSymbolTable(code, 'python');

      expect(symbolTable.imports).toContain('os');
      expect(symbolTable.imports).toContain('sys');
      expect(symbolTable.imports).toContain('pathlib');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty code', async () => {
      const symbolTable = await buildSymbolTable('', 'javascript');

      expect(symbolTable.functions).toHaveLength(0);
      expect(symbolTable.classes).toHaveLength(0);
      expect(symbolTable.variables).toHaveLength(0);
      expect(symbolTable.imports).toHaveLength(0);
    });

    it('should handle unsupported language gracefully', async () => {
      const code = 'fn main() {}';
      const symbolTable = await buildSymbolTable(code, 'rust');

      expect(symbolTable).toBeDefined();
      expect(symbolTable.functions).toHaveLength(0);
    });
  });
});
