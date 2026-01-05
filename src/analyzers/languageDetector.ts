/**
 * Language Detector
 * 
 * Automatically detects programming language from file path or code content
 * Uses multiple strategies: extension, content analysis, shebang
 */

import { logger } from '../utils/logger.js';

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
