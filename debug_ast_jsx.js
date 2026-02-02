
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const parser = new Parser();
parser.setLanguage(TypeScript.tsx);

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

const tree = parser.parse(code);

function printTree(node, depth = 0) {
    const indent = '  '.repeat(depth);
    const text = node.text.split('\n')[0];
    console.log(`${indent}${node.type} [${node.startPosition.row}:${node.startPosition.column}] - [${node.endPosition.row}:${node.endPosition.column}] "${text}"`);
    for (let i = 0; i < node.childCount; i++) {
        printTree(node.child(i), depth + 1);
    }
}

printTree(tree.rootNode);
