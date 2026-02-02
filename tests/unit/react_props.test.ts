
import { validateSymbols } from '../../src/tools/validation/validation';
import { extractJSUsages, extractJSSymbols, extractJSParams } from '../../src/tools/validation/extractors/javascript';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';

const parser = new Parser();
parser.setLanguage(JavaScript as any);

describe('React Component Prop Resolution', () => {
    
  it('should detect destructured props with default values', () => {
    const code = `
      export default function TimeEntryCard({ isLoading = false, onRetry }: TimeEntryCardProps) {
        return <button disabled={isLoading} onClick={onRetry}>Retry</button>;
      }
    `;

    const tree = parser.parse(code);
    const symbols: any[] = [];
    
    // We need to verify that extractJSSymbols (which calls extractJSParams) correctly finds 'isLoading' and 'onRetry'
    // extractJSSymbols recurses, so we pass the root
    
    // We define a helper to mimic the extractor's recursion if needed, 
    // but extractJSSymbols is designed to walk the tree.
    extractJSSymbols(tree.rootNode, code, 'test.tsx', symbols, null);

    const isLoading = symbols.find(s => s.name === 'isLoading');
    const onRetry = symbols.find(s => s.name === 'onRetry');

    expect(isLoading).toBeDefined();
    expect(isLoading?.type).toBe('variable');
    
    expect(onRetry).toBeDefined();
    expect(onRetry?.type).toBe('variable');
  });

  it('should detect nested destructured props', () => {
    const code = `
        export const UserProfile = ({ user: { name, email }, settings: { theme = 'dark' } }) => {
            console.log(name, email, theme);
        };
    `;
    const tree = parser.parse(code);
    const symbols: any[] = [];
    extractJSSymbols(tree.rootNode, code, 'test.tsx', symbols, null);

    expect(symbols.find(s => s.name === 'name')).toBeDefined();
    expect(symbols.find(s => s.name === 'email')).toBeDefined();
    expect(symbols.find(s => s.name === 'theme')).toBeDefined();
  });
});
