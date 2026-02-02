
import { validateSymbols, buildSymbolTable } from '../../src/tools/validation/validation';

describe('Object-Export Symbol Linking', () => {
  it('should not flag methods on exported constant objects as missing', () => {
    const code = `
      import { paymentsApi } from './services/payments';
      
      export function getInvoice(id: string) {
        return paymentsApi.getInvoice(id);
      }
    `;

    // Mock the project context where 'paymentsApi' is defined as a variable
    // because it was exported as: export const paymentsApi = { ... }
    const projectSymbols = [
        {
            name: 'paymentsApi',
            type: 'variable' as const, // It's usually detected as a variable
            file: 'services/payments.ts',
            line: 10
        }
    ];

    const mockUsages = [
        { 
            name: 'getInvoice', 
            type: 'methodCall', 
            object: 'paymentsApi', 
            line: 5, 
            code: 'return paymentsApi.getInvoice(id);' 
        }
    ];

    // In 'auto' mode (strictMode=false), this should NOT be flagged if we don't know the type of paymentsApi
    const issues = validateSymbols(
        mockUsages as any,
        projectSymbols,
        code,
        'typescript',
        false // strictMode = false
    );

    const methodIssues = issues.filter(i => i.type === 'nonExistentMethod');
    expect(methodIssues).toHaveLength(0);
  });
});
