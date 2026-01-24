/**
 * Manifest Loader Module
 *
 * This module handles loading and parsing package dependency manifests for different languages.
 * It supports:
 * - JavaScript/TypeScript: package.json
 * - Python: requirements.txt, pyproject.toml
 * - Python __all__ export tracking from __init__.py files
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseToml } from "smol-toml";
import { logger } from "../../utils/logger.js";
import { ManifestDependencies } from "./types.js";

// ============================================================================
// Python Standard Library - Comprehensive List
// ============================================================================

/**
 * Get Python standard library modules.
 * This is a comprehensive list based on Python 3.11+ documentation.
 * Organized by category for maintainability.
 */
function getPythonStdLib(): Set<string> {
  const modules: string[] = [
    // Text Processing
    "string",
    "re",
    "difflib",
    "textwrap",
    "unicodedata",
    "stringprep",
    "readline",
    "rlcompleter",
    // Binary Data Services
    "struct",
    "codecs",
    // Data Types
    "datetime",
    "zoneinfo",
    "calendar",
    "collections",
    "heapq",
    "bisect",
    "array",
    "weakref",
    "types",
    "copy",
    "pprint",
    "reprlib",
    "enum",
    "graphlib",
    // Numeric and Mathematical
    "numbers",
    "math",
    "cmath",
    "decimal",
    "fractions",
    "random",
    "statistics",
    // Functional Programming
    "itertools",
    "functools",
    "operator",
    // File and Directory Access
    "pathlib",
    "os",
    "fileinput",
    "stat",
    "filecmp",
    "tempfile",
    "glob",
    "fnmatch",
    "linecache",
    "shutil",
    // Data Persistence
    "pickle",
    "copyreg",
    "shelve",
    "marshal",
    "dbm",
    "sqlite3",
    // Data Compression
    "zlib",
    "gzip",
    "bz2",
    "lzma",
    "zipfile",
    "tarfile",
    // File Formats
    "csv",
    "configparser",
    "tomllib",
    "netrc",
    "plistlib",
    // Cryptographic Services
    "hashlib",
    "hmac",
    "secrets",
    // Generic OS Services
    "sys",
    "sysconfig",
    "builtins",
    "warnings",
    "dataclasses",
    "contextlib",
    "abc",
    "atexit",
    "traceback",
    "gc",
    "inspect",
    "site",
    // Concurrent Execution
    "threading",
    "multiprocessing",
    "concurrent",
    "subprocess",
    "sched",
    "queue",
    "contextvars",
    // Networking and IPC
    "asyncio",
    "socket",
    "ssl",
    "select",
    "selectors",
    "signal",
    "mmap",
    // Internet Data Handling
    "email",
    "json",
    "mailbox",
    "mimetypes",
    "base64",
    "binascii",
    "quopri",
    // Structured Markup
    "html",
    "xml",
    // Internet Protocols
    "webbrowser",
    "wsgiref",
    "urllib",
    "http",
    "ftplib",
    "poplib",
    "imaplib",
    "smtplib",
    "uuid",
    "socketserver",
    "xmlrpc",
    "ipaddress",
    // Multimedia
    "wave",
    "colorsys",
    // Internationalization
    "gettext",
    "locale",
    // Program Frameworks
    "turtle",
    "cmd",
    "shlex",
    // GUI
    "tkinter",
    "idlelib",
    // Development Tools
    "typing",
    "pydoc",
    "doctest",
    "unittest",
    "test",
    // Debugging and Profiling
    "bdb",
    "faulthandler",
    "pdb",
    "timeit",
    "trace",
    "tracemalloc",
    // Software Packaging
    "ensurepip",
    "venv",
    "zipapp",
    // Python Runtime
    "importlib",
    "runpy",
    "ast",
    "symtable",
    "token",
    "keyword",
    "tokenize",
    "tabnanny",
    "pyclbr",
    "py_compile",
    "compileall",
    "dis",
    "pickletools",
    // Custom Interpreters
    "code",
    "codeop",
    // Importing
    "zipimport",
    "pkgutil",
    "modulefinder",
    // Unix Specific
    "posix",
    "pwd",
    "grp",
    "termios",
    "tty",
    "pty",
    "fcntl",
    "resource",
    "syslog",
    // Windows Specific
    "msvcrt",
    "winreg",
    "winsound",
    // Logging
    "logging",
    // Argument Parsing
    "argparse",
    "getopt",
    "optparse",
    // Common third-party that feel like stdlib
    "typing_extensions",
  ];
  return new Set(modules);
}

// Cache the stdlib set
let pythonStdLibCache: Set<string> | null = null;

function getPythonStdLibCached(): Set<string> {
  if (!pythonStdLibCache) {
    pythonStdLibCache = getPythonStdLib();
  }
  return pythonStdLibCache;
}

// ============================================================================
// Python __all__ Export Tracking (AST-based)
// ============================================================================

/**
 * Parse Python __all__ from __init__.py files using AST for reliability.
 * Falls back to regex for edge cases.
 */
export async function loadPythonModuleExports(
  projectPath: string,
): Promise<Map<string, Set<string>>> {
  const exports = new Map<string, Set<string>>();

  try {
    const { glob } = await import("glob");
    const initFiles = await glob(`${projectPath}/**/__init__.py`, {
      ignore: ["**/node_modules/**", "**/venv/**", "**/.venv/**", "**/.git/**"],
      nodir: true,
    });

    for (const initFile of initFiles) {
      try {
        const content = await fs.readFile(initFile, "utf-8");
        const exportedNames = extractPythonAllExports(content);

        if (exportedNames.size > 0) {
          // Get module path relative to project (e.g., "app.services" from "app/services/__init__.py")
          const relativePath = path.relative(projectPath, initFile);
          const modulePath = path.dirname(relativePath).replace(/[/\\]/g, ".");

          exports.set(modulePath, exportedNames);
          logger.debug(
            `Loaded __all__ for ${modulePath}: ${Array.from(exportedNames).join(", ")}`,
          );
        }
      } catch (err) {
        // Skip unreadable files
      }
    }
  } catch (err) {
    logger.debug(`Error loading Python module exports: ${err}`);
  }

  return exports;
}

/**
 * Extract __all__ exports from Python code using AST-like parsing.
 * Handles various formats:
 * - __all__ = ["a", "b", "c"]
 * - __all__ = ['a', 'b', 'c']
 * - __all__ = [\n    "a",\n    "b",\n]
 * - __all__: list[str] = [...]
 */
function extractPythonAllExports(code: string): Set<string> {
  const exportedNames = new Set<string>();

  // Find __all__ assignment - handles type annotations too
  const allAssignmentPattern = /__all__\s*(?::\s*[^=]+)?\s*=\s*\[/g;
  const match = allAssignmentPattern.exec(code);

  if (!match) return exportedNames;

  // Find the matching closing bracket
  const startIdx = match.index + match[0].length - 1; // Position of '['
  let depth = 1;
  let idx = startIdx + 1;
  let endIdx = -1;

  while (idx < code.length && depth > 0) {
    const char = code[idx];
    if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) endIdx = idx;
    }
    idx++;
  }

  if (endIdx === -1) return exportedNames;

  // Extract the content between brackets
  const listContent = code.substring(startIdx + 1, endIdx);

  // Parse string literals from the list content
  // Handles both single and double quotes, multiline
  const stringPattern = /["']([^"']+)["']/g;
  let strMatch;
  while ((strMatch = stringPattern.exec(listContent)) !== null) {
    const name = strMatch[1].trim();
    if (name && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      exportedNames.add(name);
    }
  }

  return exportedNames;
}

/**
 * Check if a symbol is exported from a Python module via __all__
 */
export function isPythonSymbolExported(
  modulePath: string,
  symbolName: string,
  moduleExports: Map<string, Set<string>>,
): boolean {
  const exports = moduleExports.get(modulePath);

  // If no __all__ defined, assume all non-private symbols are exported
  if (!exports) {
    return true;
  }

  return exports.has(symbolName);
}

// ============================================================================
// Manifest Loading
// ============================================================================

/**
 * Load manifest dependencies for the specified language
 */
export async function loadManifestDependencies(
  projectPath: string,
  language: string,
): Promise<ManifestDependencies> {
  const result: ManifestDependencies = {
    dependencies: new Set(),
    devDependencies: new Set(),
    all: new Set(),
  };

  if (language === "javascript" || language === "typescript") {
    await loadPackageJson(projectPath, result);
  } else if (language === "python") {
    await loadPythonDependencies(projectPath, result);
  }

  return result;
}

/**
 * Load dependencies from package.json
 */
export async function loadPackageJson(
  projectPath: string,
  result: ManifestDependencies,
): Promise<void> {
  try {
    const pkgPath = path.join(projectPath, "package.json");
    const content = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);

    // Add dependencies
    if (pkg.dependencies) {
      for (const dep of Object.keys(pkg.dependencies)) {
        result.dependencies.add(dep);
        result.all.add(dep);
        // Also add scoped package base (e.g., @tanstack/react-query -> @tanstack)
        if (dep.startsWith("@")) {
          const scope = dep.split("/")[0];
          result.all.add(scope);
        }
      }
    }

    // Add devDependencies
    if (pkg.devDependencies) {
      for (const dep of Object.keys(pkg.devDependencies)) {
        result.devDependencies.add(dep);
        result.all.add(dep);
        if (dep.startsWith("@")) {
          const scope = dep.split("/")[0];
          result.all.add(scope);
        }
      }
    }

    // Add peerDependencies
    if (pkg.peerDependencies) {
      for (const dep of Object.keys(pkg.peerDependencies)) {
        result.all.add(dep);
      }
    }

    logger.debug(`Loaded ${result.all.size} packages from package.json`);
  } catch (err) {
    logger.debug(`No package.json found at ${projectPath}`);
  }
}

/**
 * Load Python dependencies from requirements.txt and pyproject.toml
 * Uses proper TOML parsing for pyproject.toml
 */
export async function loadPythonDependencies(
  projectPath: string,
  result: ManifestDependencies,
): Promise<void> {
  // Load requirements.txt
  await loadRequirementsTxt(projectPath, result);

  // Load pyproject.toml with proper TOML parsing
  await loadPyprojectToml(projectPath, result);

  // Add Python standard library modules
  const stdLib = getPythonStdLibCached();
  for (const mod of stdLib) {
    result.all.add(mod);
  }

  logger.debug(`Loaded ${result.all.size} Python packages`);
}

/**
 * Parse requirements.txt file
 */
async function loadRequirementsTxt(
  projectPath: string,
  result: ManifestDependencies,
): Promise<void> {
  try {
    const reqPath = path.join(projectPath, "requirements.txt");
    const content = await fs.readFile(reqPath, "utf-8");

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip empty lines, comments, and -r/-e flags
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) {
        continue;
      }

      // Extract package name (before ==, >=, <=, ~=, !=, <, >, [extras])
      const pkgName = trimmed
        .split(/[=<>!~[;@]/, 1)[0]
        .trim()
        .toLowerCase();

      if (pkgName) {
        result.all.add(pkgName);
        // Also add common import name variations (e.g., scikit-learn -> sklearn)
        result.all.add(pkgName.replace(/-/g, "_"));
        // Handle known package name -> import name mappings
        addPythonPackageAliases(pkgName, result);
      }
    }
  } catch {
    // requirements.txt not found, that's okay
  }
}

/**
 * Parse pyproject.toml using proper TOML parser
 */
async function loadPyprojectToml(
  projectPath: string,
  result: ManifestDependencies,
): Promise<void> {
  try {
    const pyprojectPath = path.join(projectPath, "pyproject.toml");
    const content = await fs.readFile(pyprojectPath, "utf-8");

    // Define interface for pyproject.toml structure
    interface PyProjectToml {
      project?: {
        dependencies?: string[];
        "optional-dependencies"?: Record<string, string[]>;
      };
      tool?: {
        poetry?: {
          dependencies?: Record<string, unknown>;
          "dev-dependencies"?: Record<string, unknown>;
        };
      };
    }

    const toml = parseToml(content) as PyProjectToml;

    // Extract dependencies from [project.dependencies]
    const projectDeps = toml?.project?.dependencies;
    if (Array.isArray(projectDeps)) {
      for (const dep of projectDeps) {
        const pkgName = extractPackageNameFromPep508(dep);
        if (pkgName) {
          result.all.add(pkgName);
          result.all.add(pkgName.replace(/-/g, "_"));
          addPythonPackageAliases(pkgName, result);
        }
      }
    }

    // Extract optional dependencies from [project.optional-dependencies]
    const optionalDeps = toml?.project?.["optional-dependencies"];
    if (optionalDeps && typeof optionalDeps === "object") {
      for (const group of Object.values(optionalDeps)) {
        if (Array.isArray(group)) {
          for (const dep of group) {
            const pkgName = extractPackageNameFromPep508(dep);
            if (pkgName) {
              result.all.add(pkgName);
              result.all.add(pkgName.replace(/-/g, "_"));
              addPythonPackageAliases(pkgName, result);
            }
          }
        }
      }
    }

    // Extract Poetry dependencies from [tool.poetry.dependencies]
    const poetryDeps = toml?.tool?.poetry?.dependencies;
    if (poetryDeps && typeof poetryDeps === "object") {
      for (const pkgName of Object.keys(poetryDeps)) {
        if (pkgName !== "python") {
          result.all.add(pkgName.toLowerCase());
          result.all.add(pkgName.toLowerCase().replace(/-/g, "_"));
          addPythonPackageAliases(pkgName.toLowerCase(), result);
        }
      }
    }

    // Extract Poetry dev dependencies
    const poetryDevDeps = toml?.tool?.poetry?.["dev-dependencies"];
    if (poetryDevDeps && typeof poetryDevDeps === "object") {
      for (const pkgName of Object.keys(poetryDevDeps)) {
        result.all.add(pkgName.toLowerCase());
        result.all.add(pkgName.toLowerCase().replace(/-/g, "_"));
        addPythonPackageAliases(pkgName.toLowerCase(), result);
      }
    }

    logger.debug(`Parsed pyproject.toml successfully`);
  } catch (err) {
    // pyproject.toml not found or parse error
    logger.debug(`Could not parse pyproject.toml: ${err}`);
  }
}

/**
 * Extract package name from PEP 508 dependency string
 * Examples: "requests>=2.0", "numpy[extra]", "package @ url"
 */
function extractPackageNameFromPep508(dep: string): string | null {
  if (typeof dep !== "string") return null;

  const trimmed = dep.trim();
  if (!trimmed) return null;

  // Match package name at the start (alphanumeric, hyphens, underscores)
  const match = trimmed.match(/^([a-zA-Z0-9][-a-zA-Z0-9._]*)/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Add known Python package name -> import name aliases
 */
function addPythonPackageAliases(
  pkgName: string,
  result: ManifestDependencies,
): void {
  const aliases: Record<string, string[]> = {
    "scikit-learn": ["sklearn"],
    pillow: ["PIL"],
    "opencv-python": ["cv2"],
    "opencv-python-headless": ["cv2"],
    beautifulsoup4: ["bs4"],
    pyyaml: ["yaml"],
    "python-dateutil": ["dateutil"],
    "python-dotenv": ["dotenv"],
    pymysql: ["MySQLdb"],
    psycopg2: ["psycopg2"],
    "psycopg2-binary": ["psycopg2"],
    "google-cloud-storage": ["google.cloud.storage"],
    "google-cloud-bigquery": ["google.cloud.bigquery"],
    protobuf: ["google.protobuf"],
  };

  const pkgAliases = aliases[pkgName];
  if (pkgAliases) {
    for (const alias of pkgAliases) {
      result.all.add(alias);
    }
  }
}
