/**
 * Package Registry Lookup Module
 * 
 * Verifies if a package exists in public registries (NPM, PyPI).
 * Used to distinguish between "Missing Dependency" (exists online) and "Hallucination" (doesn't exist).
 */

import { logger } from "../../utils/logger.js";

// Cache registry results to avoid redundant network requests
const registryCache = new Map<string, boolean>();

/**
 * Check if a package exists in the public registry.
 * 
 * @param pkgName - The package name to check
 * @param language - The programming language ('javascript', 'typescript', 'python', 'go')
 * @returns Promise<boolean> - true if package exists, false otherwise
 */
export async function checkPackageRegistry(pkgName: string, language: string): Promise<boolean> {
  const cacheKey = `${language}:${pkgName}`;
  if (registryCache.has(cacheKey)) {
    return registryCache.get(cacheKey)!;
  }

  // Common built-in or known false positives?
  // (validation.ts already filters Node built-ins)

  try {
    let exists = false;
    
    // Normalize language
    const lang = language.toLowerCase();
    
    if (lang === 'javascript' || lang === 'typescript') {
      exists = await checkNPM(pkgName);
    } else if (lang === 'python') {
      exists = await checkPyPI(pkgName);
    } else if (lang === 'go') {
      // Go uses git repos, can check proxy.golang.org
      exists = await checkGoProxy(pkgName);
    } else {
      // Unknown language - assume true to be safe (avoid false criticals)
      exists = true; 
    }

    registryCache.set(cacheKey, exists);
    return exists;
  } catch (error) {
    logger.warn(`Failed to check registry for ${pkgName}:`, error);
    // If registry check fails (network error), fail open (assume it exists)
    // to avoid blocking development or showing false critical errors.
    return true; 
  }
}

async function checkNPM(pkgName: string): Promise<boolean> {
  // Use a HEAD request if possible to save bandwidth, but registry.npmjs.org supports GET
  // We use the abbreviated metadata endpoint if possible, or just the root
  // https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md
  
  // Note: Unscoped packages are at root. Scoped packages are also reachable.
  // We use the public registry.
  
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
  
  try {
    const response = await fetch(url, {
      method: 'HEAD', // Try HEAD first
      signal: controller.signal
    });
    
    if (response.status === 200) return true;
    if (response.status === 404) return false;
    
    // If Method Not Allowed (some proxies blocking HEAD), try GET
    if (response.status === 405) {
       const getResponse = await fetch(url, {
         method: 'GET',
         headers: { 'Accept': 'application/vnd.npm.install-v1+json' }, // lighter response
         signal: controller.signal
       });
       return getResponse.status === 200;
    }
    
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Known import name -> PyPI package name mappings
// Used when the import name differs from the PyPI package name
const IMPORT_TO_PYPI: Record<string, string> = {
  dateutil: "python-dateutil",
  pythonjsonlogger: "python-json-logger",
  yaml: "pyyaml",
  cv2: "opencv-python",
  PIL: "pillow",
  bs4: "beautifulsoup4",
  sklearn: "scikit-learn",
  dotenv: "python-dotenv",
  jose: "python-jose",
  decouple: "python-decouple",
  attr: "attrs",
  gi: "pygobject",
  serial: "pyserial",
  usb: "pyusb",
  wx: "wxpython",
  sentry_sdk: "sentry-sdk",
};

async function checkPyPI(pkgName: string): Promise<boolean> {
  // Try the direct name first
  const namesToTry = [pkgName];
  // If there's a known mapping, try the real PyPI name too
  const mapped = IMPORT_TO_PYPI[pkgName];
  if (mapped) namesToTry.push(mapped);
  // Also try with python- prefix (common pattern)
  if (!pkgName.startsWith("python-")) namesToTry.push(`python-${pkgName}`);

  for (const name of namesToTry) {
    const url = `https://pypi.org/pypi/${name}/json`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      if (response.status === 200) return true;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return false;
}

async function checkGoProxy(pkgName: string): Promise<boolean> {
  // Go proxy protocol: https://proxy.golang.org/${pkgName}/@v/list
  const url = `https://proxy.golang.org/${pkgName}/@v/list`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });
    
    return response.status === 200;
  } finally {
    clearTimeout(timeoutId);
  }
}
