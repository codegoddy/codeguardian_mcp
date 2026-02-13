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
    "time",
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
 * First checks at projectPath, then searches common subdirectories
 * (frontend/, backend/, client/, server/, packages/&ast;/) for monorepo-style projects.
 * Does NOT traverse UP from projectPath to avoid loading an unrelated parent package.json.
 */
export async function loadPackageJson(
  projectPath: string,
  result: ManifestDependencies,
): Promise<void> {
  try {
    // Step 1: Check for package.json directly at projectPath
    const rootPkgPath = path.join(projectPath, "package.json");
    let foundPaths: string[] = [];

    try {
      await fs.access(rootPkgPath);
      foundPaths.push(rootPkgPath);
    } catch {
      // Not found at root
    }

    // Step 2: If no root package.json, search common subdirectories
    // This handles monorepo-style projects (e.g., frontend/package.json + backend/package.json)
    if (foundPaths.length === 0) {
      const COMMON_SUBDIRS = ["frontend", "backend", "client", "server", "app", "web", "api"];

      for (const subdir of COMMON_SUBDIRS) {
        const subPkgPath = path.join(projectPath, subdir, "package.json");
        try {
          await fs.access(subPkgPath);
          foundPaths.push(subPkgPath);
        } catch {
          // Not found
        }
      }

      // Also check packages/* for monorepo workspaces
      try {
        const packagesDir = path.join(projectPath, "packages");
        const entries = await fs.readdir(packagesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPkgPath = path.join(packagesDir, entry.name, "package.json");
            try {
              await fs.access(subPkgPath);
              foundPaths.push(subPkgPath);
            } catch {
              // Not found
            }
          }
        }
      } catch {
        // packages/ directory doesn't exist
      }
    }

    if (foundPaths.length === 0) {
      logger.debug(`No package.json found at ${projectPath} or in common subdirectories`);
      return;
    }

    // Step 3: Load and merge dependencies from all found package.json files
    for (const pkgPath of foundPaths) {
      try {
        await loadSinglePackageJson(pkgPath, result);
      } catch (err) {
        logger.debug(`Error loading package.json at ${pkgPath}: ${err}`);
      }
    }

    logger.debug(`Loaded ${result.all.size} total packages from ${foundPaths.length} package.json file(s)`);
  } catch (err) {
    logger.debug(`Error loading package.json: ${err}`);
  }
}

/**
 * Load dependencies from a single package.json file into the result
 */
async function loadSinglePackageJson(
  pkgPath: string,
  result: ManifestDependencies,
): Promise<void> {
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
      
      // SUPPORT @types PACKAGES:
      // If "import foo" is used, but only "@types/foo" is installed, we should count it as valid.
      // This happens often in TS projects where the runtime might be global or implied.
      if (dep.startsWith("@types/")) {
        const realPackage = dep.replace("@types/", "");
        result.all.add(realPackage);
        
        // Handle scoped types: @types/babel__core -> @babel/core
        if (realPackage.includes("__")) {
           const [scope, name] = realPackage.split("__");
           if (scope && name) {
             result.all.add(`@${scope}/${name}`);
           }
        }
      }

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

  logger.debug(`Loaded packages from ${pkgPath}`);
}

/**
 * Load Python dependencies from requirements.txt and pyproject.toml
 * Uses proper TOML parsing for pyproject.toml.
 * Searches common subdirectories if not found at root (like loadPackageJson).
 */
export async function loadPythonDependencies(
  projectPath: string,
  result: ManifestDependencies,
): Promise<void> {
  // Collect paths to search: root first, then common subdirectories
  const searchPaths = [projectPath];
  const COMMON_SUBDIRS = ["backend", "server", "api", "app", "src"];

  // Check if root has any Python manifest; if not, search subdirectories
  let hasRootManifest = false;
  for (const manifest of ["requirements.txt", "pyproject.toml", "Pipfile"]) {
    try {
      await fs.access(path.join(projectPath, manifest));
      hasRootManifest = true;
      break;
    } catch {
      // Not found
    }
  }

  if (!hasRootManifest) {
    for (const subdir of COMMON_SUBDIRS) {
      const subPath = path.join(projectPath, subdir);
      try {
        const stat = await fs.stat(subPath);
        if (stat.isDirectory()) {
          searchPaths.push(subPath);
        }
      } catch {
        // Not found
      }
    }
  }

  // Load from all discovered paths
  for (const searchPath of searchPaths) {
    await loadRequirementsTxt(searchPath, result);
    await loadPyprojectToml(searchPath, result);
  }

  // Add Python standard library modules
  const stdLib = getPythonStdLibCached();
  for (const mod of stdLib) {
    result.all.add(mod);
  }

  logger.debug(`Loaded ${result.all.size} Python packages`);
}

/**
 * Parse requirements.txt file at the given path (no upward traversal).
 * The caller (loadPythonDependencies) is responsible for searching subdirectories.
 */
async function loadRequirementsTxt(
  projectPath: string,
  result: ManifestDependencies,
): Promise<void> {
  const reqPath = path.join(projectPath, "requirements.txt");

  try {
    await fs.access(reqPath);
  } catch {
    // requirements.txt not found at this path
    return;
  }

  try {
    const content = await fs.readFile(reqPath, "utf-8");
    let packageCount = 0;

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
        packageCount++;

        // Extract extras: passlib[bcrypt] -> add bcrypt as a dependency
        const extrasMatch = trimmed.match(/\[([^\]]+)\]/);
        if (extrasMatch) {
          for (const extra of extrasMatch[1].split(",")) {
            const extraName = extra.trim().toLowerCase();
            if (extraName) {
              result.all.add(extraName);
              result.all.add(extraName.replace(/-/g, "_"));
            }
          }
        }
      }
    }

    logger.info(`Loaded ${packageCount} packages from requirements.txt at ${reqPath}`);
  } catch (err) {
    logger.warn(`Failed to read requirements.txt at ${reqPath}: ${err}`);
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
 * Known Python pip-package-name -> import-name aliases.
 * Shared between addPythonPackageAliases (forward) and
 * getPythonImportToPackageMap (reverse).
 */
const PYTHON_PACKAGE_ALIASES: Record<string, string[]> = {
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
    "nats-py": ["nats"],
    "python-jose": ["jose"],
    "python-json-logger": ["pythonjsonlogger"],
    "python-multipart": ["multipart"],
    "python-decouple": ["decouple"],
    uvloop: ["uvloop"],
    aiofiles: ["aiofiles"],
    httpx: ["httpx"],
    starlette: ["starlette"],
    fastapi: ["fastapi", "starlette"],
    celery: ["celery"],
    "redis-py": ["redis"],
    redis: ["redis"],
    bcrypt: ["bcrypt"],
    passlib: ["passlib"],
    pyjwt: ["jwt"],
    "stripe-python": ["stripe"],
    "sentry-sdk": ["sentry_sdk"],
    "opentelemetry-api": ["opentelemetry"],
    "opentelemetry-sdk": ["opentelemetry"],
  };

/**
 * Add known Python package name -> import name aliases to the manifest.
 * Called when processing each package found in requirements.txt / pyproject.toml.
 */
function addPythonPackageAliases(
  pkgName: string,
  result: ManifestDependencies,
): void {
  const pkgAliases = PYTHON_PACKAGE_ALIASES[pkgName];
  if (pkgAliases) {
    for (const alias of pkgAliases) {
      result.all.add(alias);
    }
  }
}

/**
 * Reverse lookup: given a Python import name (e.g. "dateutil"),
 * return the pip package name (e.g. "python-dateutil") if it's a known alias.
 * Returns null if no mapping is found.
 */
export function getPythonPipNameForImport(importName: string): string | null {
  for (const [pipName, importNames] of Object.entries(PYTHON_PACKAGE_ALIASES)) {
    if (importNames.includes(importName)) {
      return pipName;
    }
  }
  return null;
}
