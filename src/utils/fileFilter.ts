/**
 * Determine if a file should be analyzed based on path and type
 */
export function shouldAnalyzeFile(filePath: string, options?: {
  includeTests?: boolean;
  includeConfigs?: boolean;
  customExclusions?: string[];
}): boolean {
  const opts = {
    includeTests: false,
    includeConfigs: false,
    customExclusions: [],
    ...options,
  };

  const path = filePath.toLowerCase();

  // Exclude vendor/generated directories
  const excludedDirs = [
    'node_modules', 'venv', '.venv', 'dist', 'build',
    '.next', 'coverage', '__pycache__', '.git'
  ];
  if (excludedDirs.some(dir => path.includes(`/${dir}/`) || path.includes(`\\${dir}\\`))) {
    return false;
  }

  // Exclude test files unless explicitly included
  if (!opts.includeTests) {
    const testPatterns = [
      '/test/', '/tests/', '/e2e/', '/__tests__/',
      '.test.', '.spec.', '_test.', 'test_'
    ];
    if (testPatterns.some(pattern => path.includes(pattern))) {
      return false;
    }
  }

  // Exclude config files unless explicitly included
  if (!opts.includeConfigs) {
    const configPatterns = [
      '.config.', 'config.', 'setup.', '.rc.',
      'jest.config', 'webpack.config', 'babel.config'
    ];
    if (configPatterns.some(pattern => path.includes(pattern))) {
      return false;
    }
  }

  // Custom exclusions
  if (opts.customExclusions.some(pattern => path.includes(pattern))) {
    return false;
  }

  return true;
}
