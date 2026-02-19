const Parser = require("./node_modules/tree-sitter");
const Python = require("./node_modules/tree-sitter-python");

const parser = new Parser();
parser.setLanguage(Python);

const code = `from typing import Optional, List, Dict, Union
from uuid import UUID
from datetime import timedelta

class PlannedBlockResponse:
    id: UUID
    start_time: Optional[str] = None
    items: List[str] = []
    meta: Dict[str, int]

# Function with typed params (no default)
def foo(x: Optional[str], y: UUID) -> List[str]:
    pass

# Function with typed params (with default)
async def get_activities(
    entity_type: Optional[str] = None,
    limit: int = 10,
) -> List[str]:
    pass

# Union type hint
def bar(val: Union[str, int]) -> None:
    pass

# timedelta usage
def baz(ttl: timedelta = timedelta(seconds=60)) -> None:
    pass

# Nested generic
def qux(data: Optional[List[Dict[str, int]]] = None) -> None:
    pass
`;

const tree = parser.parse(code);

function showNode(node, depth = 0) {
  if (depth > 10) return;
  const indent = "  ".repeat(depth);
  const text =
    node.text.length < 50
      ? JSON.stringify(node.text)
      : JSON.stringify(node.text.slice(0, 50) + "...");
  console.log(`${indent}[${node.type}]${node.isNamed ? "" : "(anon)"} ${text}`);
  for (const child of node.children) {
    showNode(child, depth + 1);
  }
}

console.log("=== Searching for parameter and annotation nodes ===\n");

const INTERESTING = new Set([
  "typed_parameter",
  "typed_default_parameter",
  "annotated_assignment",
  "generic_type",
  "subscript",
  "type",
  "union_type",
  "binary_operator",
]);

function findNodes(node, depth = 0) {
  if (INTERESTING.has(node.type)) {
    const indent = "  ".repeat(depth);
    console.log(
      `\n${indent}>>> [${node.type}] text=${JSON.stringify(node.text.slice(0, 60))}`,
    );
    console.log(`${indent}    parent=[${node.parent?.type}]`);
    console.log(`${indent}    children:`);
    for (const child of node.children) {
      console.log(
        `${indent}      [${child.type}] isNamed=${child.isNamed} text=${JSON.stringify(child.text.slice(0, 40))}`,
      );
    }
    // Check named fields
    for (const f of [
      "type",
      "value",
      "variable",
      "name",
      "default",
      "left",
      "right",
    ]) {
      const fc = node.childForFieldName(f);
      if (fc) {
        console.log(
          `${indent}    field '${f}': [${fc.type}] text=${JSON.stringify(fc.text.slice(0, 40))}`,
        );
      }
    }
  }
  for (const child of node.children) {
    findNodes(child, depth + 1);
  }
}

findNodes(tree.rootNode);

console.log("\n\n=== All unique node types in this file ===");
const types = new Set();
function collectTypes(node) {
  types.add(node.type);
  for (const child of node.children) collectTypes(child);
}
collectTypes(tree.rootNode);
console.log([...types].sort().join(", "));

console.log(
  "\n\n=== Specific check: typed_parameter vs typed_default_parameter ===",
);
let tpCount = 0,
  tdpCount = 0;
function countParamTypes(node) {
  if (node.type === "typed_parameter") tpCount++;
  if (node.type === "typed_default_parameter") tdpCount++;
  for (const child of node.children) countParamTypes(child);
}
countParamTypes(tree.rootNode);
console.log(`typed_parameter: ${tpCount}`);
console.log(`typed_default_parameter: ${tdpCount}`);

console.log(
  "\n\n=== Check: does Optional[str] produce 'subscript' or 'generic_type'? ===",
);
let subscriptCount = 0,
  genericTypeCount = 0;
function countTypeNodes(node) {
  if (node.type === "subscript") subscriptCount++;
  if (node.type === "generic_type") genericTypeCount++;
  for (const child of node.children) countTypeNodes(child);
}
countTypeNodes(tree.rootNode);
console.log(`subscript nodes: ${subscriptCount}`);
console.log(`generic_type nodes: ${genericTypeCount}`);

console.log(
  "\n\n=== Check: assignment vs annotated_assignment for class body annotations ===",
);
let assignCount = 0,
  annotAssignCount = 0;
function countAssignTypes(node) {
  if (node.type === "assignment") assignCount++;
  if (node.type === "annotated_assignment") annotAssignCount++;
  for (const child of node.children) countAssignTypes(child);
}
countAssignTypes(tree.rootNode);
console.log(`assignment nodes: ${assignCount}`);
console.log(`annotated_assignment nodes: ${annotAssignCount}`);
