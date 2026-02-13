
import { describe, it, expect, beforeAll } from "vitest";
import { extractSymbolsAST, extractUsagesAST, extractImportsAST } from '../../src/tools/validation/extractors/index.js';

describe('False Positives Reproduction', () => {

  it('should correctly extract destructured function parameters as defined variables', async () => {
    const code = `
      export const useTimeTracker = ({ initialViewMode = "list", autoConnect = true }) => {
        console.log(initialViewMode);
        console.log(autoConnect);
      };
    `;
    
    // Use the unified extractor function. 'javascript' is usually the standard key, 
    // or 'typescript' if the parser supports TS syntax.
    const symbols = extractSymbolsAST(code, 'test.ts', 'typescript');
    
    // We expect 'initialViewMode' and 'autoConnect' to be extracted as DEFINITIONS/SYMBOLS.
    // The previous feedback suggests they were treated as usages but not defined, hence "undefined variable".
    // If they appear in the symbols list, they are recognized as declarations.
    const initialViewMode = symbols.find(s => s.name === 'initialViewMode');
    const autoConnect = symbols.find(s => s.name === 'autoConnect');

    expect(initialViewMode).toBeDefined();
    expect(autoConnect).toBeDefined();
  });

  it('should NOT identify JSX text as variables', async () => {
    const code = `
      export const Component = () => {
        return (
          <div>
            <h4>Budget & Time Tracking</h4>
            <p>Time / Tracking</p>
          </div>
        );
      };
    `;
    
    // JSX parsing often happens under 'typescript' / 'javascript' extractors.
    const imports = extractImportsAST(code, 'typescript');
    const usages = extractUsagesAST(code, 'typescript', imports);
    
    // "Time", "Tracking", "Budget" should NOT be usages if they are just text content.
    const timeUsage = usages.find(u => u.name === 'Time');
    const trackingUsage = usages.find(u => u.name === 'Tracking');
    const budgetUsage = usages.find(u => u.name === 'Budget');
    
    expect(timeUsage).toBeUndefined();
    expect(trackingUsage).toBeUndefined();
    expect(budgetUsage).toBeUndefined();
  });

  it('should resolve methods on imported objects', async () => {
    const code = `
      import { projectsApi } from './services/projects';
      
      export const fetchProjects = () => {
        return projectsApi.getProjects();
      };
    `;

    const imports = extractImportsAST(code, 'typescript');
    const usages = extractUsagesAST(code, 'typescript', imports);
    
    // Use usages extraction to see what we get.
    // We expect 'projectsApi' to be a usage (but it is imported, so it might be filtered out by extractUsagesAST logic).
    // The previous implementation of extractUsagesAST creates a set of importedSymbols and passes it to the extractor.
    // Imported symbols are SKIPPED in usages if they are in that set.
    
    // However, the *property access* 'getProjects' *should* be visible as a usage or part of a chain if we extract property access.
    // Let's check if 'getProjects' is extracted as a usage.
    
    // Note: If 'getProjects' is a method on an object, the extractor might extract it as 'getProjects' usage
    // or it might see it as 'projectsApi.getProjects'.
    
    const getProjectsUsage = usages.find(u => u.name === 'getProjects');
    
    // If getProjects is extracted as a usage, it means the system sees it.
    // If it's missing, then we have a problem where method calls on imported objects are invisible.
    expect(getProjectsUsage).toBeDefined();
  });
});
