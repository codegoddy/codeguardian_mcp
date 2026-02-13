/**
 * Language Detector
 * 
 * Automatically detects programming language from file path or code content
 * Uses multiple strategies: extension, content analysis, shebang
 */

import { logger } from '../utils/logger.js';
import { getParser } from "../tools/validation/parser.js";

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  method: 'extension' | 'content' | 'shebang' | 'framework';
  framework?: string;
}

/**
 * File extension to language mapping
 */
const EXTENSION_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  
  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',
  
  // Go
  '.go': 'go',
  
  // Java
  '.java': 'java',
  
  // C/C++
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  
  // Rust
  '.rs': 'rust',
  
  // Ruby
  '.rb': 'ruby',
  
  // PHP
  '.php': 'php',
  
  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  
  // Other
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.sql': 'sql',
};

/**
 * Language-specific keywords for content-based detection
 */
const LANGUAGE_KEYWORDS: Record<string, string[]> = {
  javascript: [
    'function', 'const', 'let', 'var', 'async', 'await', 'import', 'export',
    'class', 'extends', 'constructor', 'this', 'new', 'typeof', 'instanceof',
    'console.log', 'require', 'module.exports', '=>'
  ],
  typescript: [
    'interface', 'type', 'enum', 'namespace', 'declare', 'implements',
    'public', 'private', 'protected', 'readonly', 'abstract', ': string',
    ': number', ': boolean', '<T>', 'as const'
  ],
  python: [
    'def', 'class', 'import', 'from', 'if __name__', 'self', 'None', 'True',
    'False', 'elif', 'except', 'finally', 'with', 'as', 'lambda', 'yield',
    'async def', 'await', '__init__', 'print('
  ],
  go: [
    'package', 'func', 'import', 'type', 'struct', 'interface', 'defer',
    'go func', 'chan', 'select', 'case', 'range', 'make', 'new', ':='
  ],
  java: [
    'public class', 'private', 'protected', 'static', 'void', 'extends',
    'implements', 'interface', 'abstract', 'final', 'synchronized',
    'throws', 'try', 'catch', 'finally', 'new', 'this', 'super'
  ],
  ruby: [
    'def', 'end', 'class', 'module', 'require', 'include', 'attr_accessor',
    'puts', 'gets', 'do', 'yield', 'lambda', 'proc', '@', '@@'
  ],
  php: [
    '<?php', 'function', 'class', 'namespace', 'use', 'public', 'private',
    'protected', 'static', '$', '->', '=>', 'echo', 'print', 'require'
  ],
  rust: [
    'fn', 'let', 'mut', 'impl', 'trait', 'struct', 'enum', 'match',
    'pub', 'use', 'mod', 'crate', '&', 'Box<', 'Vec<', 'Option<'
  ],
};

/**
 * Framework-specific patterns
 */
const FRAMEWORK_PATTERNS: Record<string, { pattern: RegExp; language: string }> = {
  react: { pattern: /import.*from\s+['"]react['"]|React\.|useState|useEffect/i, language: 'javascript' },
  vue: { pattern: /import.*from\s+['"]vue['"]|Vue\.|<template>|<script>/i, language: 'javascript' },
  angular: { pattern: /@Component|@Injectable|@NgModule|import.*from\s+['"]@angular/i, language: 'typescript' },
  django: { pattern: /from\s+django\.|import\s+django|models\.Model|views\./i, language: 'python' },
  flask: { pattern: /from\s+flask\s+import|@app\.route|Flask\(__name__\)/i, language: 'python' },
  fastapi: { pattern: /from\s+fastapi\s+import|@app\.(get|post|put|delete)|FastAPI\(/i, language: 'python' },
  express: { pattern: /require\(['"]express['"]\)|express\(\)|app\.(get|post|put|delete)/i, language: 'javascript' },
  nextjs: { pattern: /from\s+['"]next\/|export\s+default\s+function.*\(\s*\)\s*\{|getServerSideProps|getStaticProps/i, language: 'javascript' },
};

/**
 * Detect language from file path
 */
export function detectFromPath(filePath: string): LanguageDetectionResult | null {
  const extension = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const language = EXTENSION_MAP[extension];
  
  if (language) {
    logger.debug(`Detected ${language} from extension ${extension}`);
    return {
      language,
      confidence: 100,
      method: 'extension',
    };
  }
  
  return null;
}

/**
 * Detect language from shebang line
 */
export function detectFromShebang(code: string): LanguageDetectionResult | null {
  const firstLine = code.split('\n')[0].trim();
  
  if (firstLine.startsWith('#!')) {
    if (firstLine.includes('python')) {
      return { language: 'python', confidence: 95, method: 'shebang' };
    }
    if (firstLine.includes('node')) {
      return { language: 'javascript', confidence: 95, method: 'shebang' };
    }
    if (firstLine.includes('bash') || firstLine.includes('sh')) {
      return { language: 'shell', confidence: 95, method: 'shebang' };
    }
    if (firstLine.includes('ruby')) {
      return { language: 'ruby', confidence: 95, method: 'shebang' };
    }
    if (firstLine.includes('php')) {
      return { language: 'php', confidence: 95, method: 'shebang' };
    }
  }
  
  return null;
}

/**
 * Detect framework from code content
 */
export function detectFramework(code: string): { framework: string; language: string } | null {
  for (const [framework, { pattern, language }] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (pattern.test(code)) {
      logger.debug(`Detected ${framework} framework`);
      return { framework, language };
    }
  }
  return null;
}

/**
 * Detect language from code content
 */
export function detectFromContent(code: string): LanguageDetectionResult | null {
  // Prefer AST-based detection for languages we can parse accurately.
  // This reduces false positives from regex keyword matches in comments/strings.
  const astDetected = detectFromContentAST(code);
  if (astDetected) return astDetected;

  const scores: Record<string, number> = {};
  
  // Count keyword matches for each language
  for (const [language, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = code.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    scores[language] = score;
  }
  
  // Find language with highest score
  let maxScore = 0;
  let detectedLanguage = '';
  
  for (const [language, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLanguage = language;
    }
  }
  
  if (maxScore > 0) {
    // Calculate confidence based on score
    const totalKeywords = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const confidence = Math.min(90, Math.round((maxScore / totalKeywords) * 100));
    
    logger.debug(`Detected ${detectedLanguage} from content with confidence ${confidence}%`);
    return {
      language: detectedLanguage,
      confidence,
      method: 'content',
    };
  }
  
  return null;
}

// ==========================================================================
// AST-based detection (Tree-sitter)
// ==========================================================================

type ASTDetectLang = "typescript" | "javascript" | "python";

/**
 * Detect language from code content using Tree-sitter.
 *
 * Only runs for languages supported by the validation parser cache.
 */
function detectFromContentAST(code: string): LanguageDetectionResult | null {
  const candidates: ASTDetectLang[] = ["typescript", "javascript", "python"];
  const results = candidates.map((language) => {
    const r = scoreTreeSitterParse(code, language);
    return { language, ...r };
  });

  // Choose the best by totalScore; break ties with fewer errors.
  results.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.errorCount - b.errorCount;
  });

  const best = results[0];
  const second = results[1];

  // If parsing was too error-heavy, don't trust the AST signal.
  if (!best || best.totalScore <= 0) return null;

  // If JS and TS are close, prefer TS only when TS-specific nodes exist.
  let detectedLanguage: string = best.language;
  if (
    (best.language === "typescript" || best.language === "javascript") &&
    second &&
    (second.language === "typescript" || second.language === "javascript")
  ) {
    const ts = results.find((r) => r.language === "typescript");
    const js = results.find((r) => r.language === "javascript");
    if (ts && js) {
      const close = Math.abs(ts.totalScore - js.totalScore) <= 5;
      if (close) {
        detectedLanguage = ts.tsSpecificCount > 0 ? "typescript" : "javascript";
      }
    }
  }

  const margin = second ? best.totalScore - second.totalScore : best.totalScore;
  const confidence = Math.max(60, Math.min(90, 60 + margin * 3));

  logger.debug(
    `Detected ${detectedLanguage} from AST content scoring (score=${best.totalScore}, errors=${best.errorCount})`,
  );

  return {
    language: detectedLanguage,
    confidence,
    method: "content",
  };
}

function scoreTreeSitterParse(
  code: string,
  language: ASTDetectLang,
): {
  totalScore: number;
  errorCount: number;
  featureScore: number;
  tsSpecificCount: number;
} {
  const parser = getParser(language);
  const tree = parser.parse(code);

  // Node-type weights: boost syntax constructs that are strong signals.
  const WEIGHTS: Record<ASTDetectLang, Record<string, number>> = {
    javascript: {
      import_statement: 3,
      export_statement: 3,
      require: 2,
      function_declaration: 4,
      arrow_function: 4,
      class_declaration: 4,
      method_definition: 2,
      jsx_element: 2,
      jsx_self_closing_element: 2,
    },
    typescript: {
      // Shared JS signals
      import_statement: 3,
      export_statement: 3,
      function_declaration: 4,
      arrow_function: 4,
      class_declaration: 4,
      method_definition: 2,
      jsx_element: 2,
      jsx_self_closing_element: 2,

      // TS-strong signals
      interface_declaration: 8,
      type_alias_declaration: 7,
      enum_declaration: 7,
      type_annotation: 5,
      return_type: 4,
      implements_clause: 4,
      extends_clause: 2,
      generic_type: 2,
      type_arguments: 2,
      type_parameter: 2,
    },
    python: {
      import_statement: 4,
      import_from_statement: 4,
      function_definition: 6,
      class_definition: 6,
      decorated_definition: 3,
      decorator: 3,
      with_statement: 2,
      try_statement: 2,
      except_clause: 2,
      await: 2,
    },
  };

  let errorCount = 0;
  let featureScore = 0;
  let tsSpecificCount = 0;

  const weightMap = WEIGHTS[language];
  const TS_SPECIFIC = new Set([
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
    "type_annotation",
    "return_type",
    "implements_clause",
    "type_arguments",
    "type_parameter",
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (node: any) => {
    if (!node) return;
    if (node.type === "ERROR") errorCount++;
    const w = weightMap[node.type];
    if (w) {
      featureScore += w;
      if (language === "typescript" && TS_SPECIFIC.has(node.type)) {
        tsSpecificCount++;
      }
    }
    for (const child of node.children || []) {
      visit(child);
    }
  };

  visit(tree.rootNode);

  // Penalize parse errors heavily; favor high-signal nodes.
  const totalScore = featureScore - errorCount * 5;

  return { totalScore, errorCount, featureScore, tsSpecificCount };
}

/**
 * Detect language using all available strategies
 */
export function detectLanguage(
  code: string,
  filePath?: string
): LanguageDetectionResult {
  // Strategy 1: Try file extension (highest confidence)
  if (filePath) {
    const fromPath = detectFromPath(filePath);
    if (fromPath) {
      // Check for framework
      const framework = detectFramework(code);
      if (framework) {
        return {
          ...fromPath,
          framework: framework.framework,
          method: 'framework',
        };
      }
      return fromPath;
    }
  }
  
  // Strategy 2: Try shebang
  const fromShebang = detectFromShebang(code);
  if (fromShebang) {
    return fromShebang;
  }
  
  // Strategy 3: Try framework detection
  const framework = detectFramework(code);
  if (framework) {
    return {
      language: framework.language,
      confidence: 85,
      method: 'framework',
      framework: framework.framework,
    };
  }
  
  // Strategy 4: Try content analysis
  const fromContent = detectFromContent(code);
  if (fromContent) {
    return fromContent;
  }
  
  // Default to JavaScript if nothing detected
  logger.warn('Could not detect language, defaulting to javascript');
  return {
    language: 'javascript',
    confidence: 50,
    method: 'content',
  };
}

/**
 * Get supported languages
 */
export function getSupportedLanguages(): string[] {
  return Array.from(new Set(Object.values(EXTENSION_MAP)));
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_MAP);
}

/**
 * Check if language is supported
 */
export function isLanguageSupported(language: string): boolean {
  return getSupportedLanguages().includes(language.toLowerCase());
}
