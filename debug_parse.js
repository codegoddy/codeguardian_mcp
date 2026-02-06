const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript').typescript;

const code1 = `
class NatsClient {
  private websocket: WebSocket | null = null;
  private callbacks: Map<string, Set<(event: NatsEvent) => void>> = new Map();
}
`;

const code2 = `
<ReactQueryDevtools initialIsOpen={false} />
`;

const code3 = `
<img src={profileImageUrl} alt={displayName} />
`;

function debugParse(code, filename) {
  console.log(`\n=== ${filename} ===`);
  const parser = new Parser();
  parser.setLanguage(TypeScript);
  const tree = parser.parse(code);
  
  function printTree(node, indent = 0) {
    const spaces = '  '.repeat(indent);
    const text = code.substring(node.startIndex, node.endIndex).substring(0, 50).replace(/\n/g, '\\n');
    console.log(`${spaces}${node.type}: "${text}"`);
    for (const child of node.children) {
      printTree(child, indent + 1);
    }
  }
  
  printTree(tree.rootNode);
}

debugParse(code1, "Class with private fields");
debugParse(code2, "JSX with props");
debugParse(code3, "JSX with src/alt");
