
// import { validationTest } from './validation/test-utils';
import { validateSymbols } from '../../src/tools/validation/validation';
import { extractSymbolsAST } from '../../src/tools/validation/extractors/index';
import { extractJSUsages } from '../../src/tools/validation/extractors/javascript';
import { getParser } from '../../src/tools/validation/parser.js';

describe('Lexical "this" Scope Resolution', () => {
  it('should not flag "this" as undefined in class methods', async () => {
    const code = `
      export class ApiService {
        private baseUrl: string = '/api';

        async get(endpoint: string) {
          return this.makeRequest(endpoint, 'GET');
        }

        async post(endpoint: string, data: any) {
          return this.makeRequest(endpoint, 'POST', data);
        }

        private async makeRequest(endpoint: string, method: string, data?: any) {
          console.log(this.baseUrl);
          return fetch(this.baseUrl + endpoint);
        }
      }
    `;

    // Manually run the pipeline parts we need to test
    const tree = getParser('typescript').parse(code);
    const symbols = [];
    extractSymbolsAST(code, 'test.ts', 'typescript'); // We use this purely to mock project context if needed
    
    // Check usages
    const usages = [];
    const root = tree.rootNode;
    // We need to implement a mini-extractor or just use the real one if accessible
    // Since we can't easily import the internal extractJSUsages without exporting it, 
    // we assume we are testing validateSymbols directly which takes usages.
    
    // Let's rely on the real behavior by mocking usages that would be found
    // The extractor WOULD find "this" as a usage reference or object
    
    const mockUsages = [
        { name: "makeRequest", type: "methodCall", object: "this", line: 6, code: "return this.makeRequest(endpoint, 'GET');" },
        { name: "makeRequest", type: "methodCall", object: "this", line: 10, code: "return this.makeRequest(endpoint, 'POST', data);" },
        { name: "baseUrl", type: "reference", object: "this", line: 14, code: "console.log(this.baseUrl);" },
        { name: "baseUrl", type: "reference", object: "this", line: 15, code: "return fetch(this.baseUrl + endpoint);" }
    ];

    const issues = validateSymbols(
      mockUsages as any, 
      [], // Empty project symbols (so it doesn't find "makeRequest" globally, forcing reliance on "this" logic)
      code,
      'typescript',
      true // strict mode
    );

    const thisIssues = issues.filter(i => 
        (i.message.includes("'this' is not defined") || 
         i.message.includes("not found on 'this'"))
    );

    expect(thisIssues).toHaveLength(0);
  });

  it('should not flag "this" properties in react components if used incorrectly (we trust TS mostly, but check context)', async () => {
     // This test ensures we don't regress on simple "this" usage
     const code = `
        class Component {
            render() {
                return this.props.value;
            }
        }
     `;
     const mockUsages = [
         { name: "props", type: "reference", object: "this", line: 4, code: "return this.props.value;" }
     ];

     const issues = validateSymbols(
        mockUsages as any,
        [],
        code,
        'typescript',
        true
     );

     const thisIssues = issues.filter(i => i.message.includes("'this'"));
     expect(thisIssues).toHaveLength(0);
  });
});
