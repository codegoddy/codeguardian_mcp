/**
 * Standard Library Registry
 * Maintains lists of standard library functions, classes, and modules
 * to prevent false positives when detecting hallucinations
 */

// Python built-in functions
export const PYTHON_BUILTINS = new Set([
  // Built-in functions
  'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'breakpoint', 'bytearray', 'bytes',
  'callable', 'chr', 'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir',
  'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset',
  'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int',
  'isinstance', 'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max',
  'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord', 'pow', 'print',
  'property', 'range', 'repr', 'reversed', 'round', 'set', 'setattr', 'slice',
  'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip',
  '__import__',
  
  // Common exceptions
  'Exception', 'ValueError', 'TypeError', 'KeyError', 'AttributeError', 'IndexError',
  'RuntimeError', 'NotImplementedError', 'StopIteration', 'ImportError', 'JSONDecodeError',
]);

// Python standard library modules and their common functions
export const PYTHON_STDLIB: Record<string, string[]> = {
  'os': ['getenv', 'environ', 'path', 'getcwd', 'chdir', 'listdir', 'mkdir', 'remove', 'rename', 'system', 'walk'],
  'os.path': ['join', 'exists', 'isfile', 'isdir', 'basename', 'dirname', 'abspath', 'split'],
  'sys': ['argv', 'exit', 'path', 'version', 'platform', 'stdout', 'stderr', 'stdin'],
  'json': ['loads', 'dumps', 'load', 'dump', 'JSONDecodeError'],
  'datetime': ['datetime', 'date', 'time', 'timedelta', 'timezone', 'utcnow', 'now', 'strptime', 'strftime'],
  'time': ['sleep', 'time', 'strftime', 'strptime'],
  're': ['match', 'search', 'findall', 'sub', 'compile', 'split'],
  'math': ['sqrt', 'pow', 'floor', 'ceil', 'sin', 'cos', 'tan', 'log', 'exp'],
  'random': ['random', 'randint', 'choice', 'shuffle', 'sample'],
  'collections': ['defaultdict', 'Counter', 'OrderedDict', 'namedtuple', 'deque'],
  'itertools': ['chain', 'combinations', 'permutations', 'product', 'cycle'],
  'functools': ['wraps', 'lru_cache', 'partial', 'reduce'],
  'pathlib': ['Path', 'PurePath'],
  'typing': ['List', 'Dict', 'Set', 'Tuple', 'Optional', 'Union', 'Any', 'Callable'],
  'asyncio': ['run', 'create_task', 'gather', 'sleep', 'wait', 'Queue'],
  'logging': ['getLogger', 'info', 'debug', 'warning', 'error', 'critical'],
  'unittest': ['TestCase', 'main', 'mock', 'patch'],
  'pytest': ['fixture', 'mark', 'raises', 'skip'],
  'requests': ['get', 'post', 'put', 'delete', 'patch', 'Session'],
  'urllib': ['request', 'parse', 'error'],
  'hashlib': ['md5', 'sha1', 'sha256', 'sha512', 'new'],
  'base64': ['b64encode', 'b64decode'],
  'pickle': ['dump', 'load', 'dumps', 'loads'],
  'csv': ['reader', 'writer', 'DictReader', 'DictWriter'],
  'subprocess': ['run', 'Popen', 'call', 'check_output'],
  'threading': ['Thread', 'Lock', 'Event', 'Semaphore'],
  'multiprocessing': ['Process', 'Pool', 'Queue', 'Manager'],
  'traceback': ['format_exc', 'print_exc', 'format_stack', 'print_stack'],
  'hmac': ['new', 'compare_digest'],
  'uuid': ['UUID', 'uuid4', 'uuid1', 'uuid3', 'uuid5'],
};

// Python popular third-party libraries
export const PYTHON_THIRD_PARTY: Record<string, string[]> = {
  'fastapi': ['FastAPI', 'APIRouter', 'Depends', 'HTTPException', 'status', 'Request', 'Response', 'File', 'UploadFile', 'Form', 'Query', 'Path', 'Body', 'Header'],
  'fastapi.security': ['OAuth2PasswordBearer', 'OAuth2PasswordRequestForm', 'HTTPBearer', 'HTTPAuthorizationCredentials'],
  'pydantic': ['BaseModel', 'Field', 'validator', 'root_validator', 'ValidationError'],
  'sqlalchemy': ['create_engine', 'Column', 'Integer', 'String', 'Boolean', 'DateTime', 'ForeignKey', 'relationship', 'Table', 'MetaData'],
  'sqlalchemy.orm': ['Session', 'sessionmaker', 'declarative_base', 'relationship', 'Query', 'select', 'where', 'order_by', 'scalars', 'execute', 'add', 'commit', 'refresh', 'query'],
  'sqlalchemy.ext.declarative': ['declarative_base'],
  'flask': ['Flask', 'request', 'jsonify', 'render_template', 'redirect', 'url_for', 'session', 'abort'],
  'django.db': ['models', 'connection', 'transaction'],
  'django.db.models': ['Model', 'CharField', 'IntegerField', 'DateTimeField', 'ForeignKey', 'ManyToManyField', 'Q', 'F'],
  'django.http': ['HttpResponse', 'JsonResponse', 'HttpRequest', 'HttpResponseRedirect'],
  'django.shortcuts': ['render', 'redirect', 'get_object_or_404'],
  'django.contrib.auth': ['authenticate', 'login', 'logout', 'get_user_model'],
  'pandas': ['DataFrame', 'Series', 'read_csv', 'read_excel', 'read_json'],
  'numpy': ['array', 'zeros', 'ones', 'arange', 'linspace', 'random'],
  'dotenv': ['load_dotenv', 'find_dotenv', 'dotenv_values'],
  'jwt': ['encode', 'decode', 'PyJWT'],
  'bcrypt': ['hashpw', 'checkpw', 'gensalt'],
  'redis': ['Redis', 'StrictRedis'],
  'celery': ['Celery', 'task', 'shared_task'],
  'pytest': ['fixture', 'mark', 'raises', 'skip', 'parametrize'],
  'httpx': ['AsyncClient', 'Client', 'get', 'post', 'Timeout', 'Limits'],
  'openai': ['OpenAI', 'ChatCompletion', 'Completion'],
};

// JavaScript/TypeScript built-in objects and functions
export const JS_BUILTINS = new Set([
  // Global objects
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
  'Math', 'Date', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Promise', 'Proxy', 'Reflect', 'JSON', 'Intl',
  
  // Global functions
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI',
  'encodeURIComponent', 'decodeURIComponent', 'eval', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'console',
  
  // Common methods
  'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toLocaleString', 'constructor',
]);

// JavaScript/TypeScript standard library
export const JS_STDLIB: Record<string, string[]> = {
  'fs': ['readFile', 'writeFile', 'readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync', 'readdirSync'],
  'path': ['join', 'resolve', 'dirname', 'basename', 'extname', 'normalize'],
  'http': ['createServer', 'request', 'get'],
  'https': ['createServer', 'request', 'get'],
  'crypto': ['createHash', 'randomBytes', 'createCipheriv', 'createDecipheriv'],
  'util': ['promisify', 'inspect', 'format', 'inherits'],
  'events': ['EventEmitter'],
  'stream': ['Readable', 'Writable', 'Transform', 'pipeline'],
  'buffer': ['Buffer'],
  'process': ['env', 'argv', 'exit', 'cwd', 'nextTick'],
};

// JavaScript/TypeScript popular third-party libraries
export const JS_THIRD_PARTY: Record<string, string[]> = {
  'react': ['useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo', 'useRef', 'useImperativeHandle', 'useLayoutEffect', 'useDebugValue', 'Component', 'PureComponent', 'createElement', 'Fragment', 'StrictMode', 'Suspense', 'lazy'],
  'react-dom': ['render', 'hydrate', 'createPortal', 'findDOMNode', 'unmountComponentAtNode'],
  'express': ['Router', 'json', 'urlencoded', 'static', 'use', 'get', 'post', 'put', 'delete', 'patch'],
  'axios': ['get', 'post', 'put', 'delete', 'patch', 'request', 'create'],
  'lodash': ['map', 'filter', 'reduce', 'find', 'findIndex', 'forEach', 'some', 'every', 'debounce', 'throttle', 'cloneDeep', 'merge'],
  'moment': ['format', 'parse', 'add', 'subtract', 'diff', 'isBefore', 'isAfter'],
  'dayjs': ['format', 'parse', 'add', 'subtract', 'diff', 'isBefore', 'isAfter'],
  'joi': ['object', 'string', 'number', 'boolean', 'array', 'validate'],
  'yup': ['object', 'string', 'number', 'boolean', 'array', 'validate'],
  'bcrypt': ['hash', 'compare', 'genSalt', 'hashSync', 'compareSync'],
  'jsonwebtoken': ['sign', 'verify', 'decode'],
  'mongoose': ['Schema', 'model', 'connect', 'connection'],
  'sequelize': ['Sequelize', 'Model', 'DataTypes'],
  'typeorm': ['Entity', 'Column', 'PrimaryGeneratedColumn', 'ManyToOne', 'OneToMany', 'ManyToMany', 'CreateDateColumn', 'UpdateDateColumn'],
  'next': ['useRouter', 'usePathname', 'useSearchParams', 'Link', 'Image', 'Head'],
  'vue': ['ref', 'reactive', 'computed', 'watch', 'onMounted', 'onUnmounted', 'defineComponent'],
  'angular': ['Component', 'Injectable', 'NgModule', 'Input', 'Output', 'EventEmitter'],
  'react-query': ['useQuery', 'useMutation', 'useQueryClient', 'QueryClient', 'QueryClientProvider'],
};

// JavaScript/TypeScript keywords (not functions)
export const JS_KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'return',
  'static', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'yield',
]);

// Python keywords (not functions)
export const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def',
  'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if',
  'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
]);

/**
 * Check if a function/class is from a standard library
 */
export function isStandardLibrary(name: string, language: string): boolean {
  if (language === 'python') {
    // Check built-ins
    if (PYTHON_BUILTINS.has(name)) return true;
    
    // Check keywords
    if (PYTHON_KEYWORDS.has(name)) return true;
    
    // Check standard library
    for (const funcs of Object.values(PYTHON_STDLIB)) {
      if (funcs.includes(name)) return true;
    }
    
    // Check popular third-party
    for (const funcs of Object.values(PYTHON_THIRD_PARTY)) {
      if (funcs.includes(name)) return true;
    }
  } else if (language === 'javascript' || language === 'typescript') {
    // Check built-ins
    if (JS_BUILTINS.has(name)) return true;
    
    // Check keywords
    if (JS_KEYWORDS.has(name)) return true;
    
    // Check standard library
    for (const funcs of Object.values(JS_STDLIB)) {
      if (funcs.includes(name)) return true;
    }
    
    // Check popular third-party
    for (const funcs of Object.values(JS_THIRD_PARTY)) {
      if (funcs.includes(name)) return true;
    }
  }
  
  return false;
}

/**
 * Get the module/package for a standard library function
 */
export function getStandardLibraryModule(name: string, language: string): string | null {
  if (language === 'python') {
    for (const [module, funcs] of Object.entries(PYTHON_STDLIB)) {
      if (funcs.includes(name)) return module;
    }
    for (const [module, funcs] of Object.entries(PYTHON_THIRD_PARTY)) {
      if (funcs.includes(name)) return module;
    }
  } else if (language === 'javascript' || language === 'typescript') {
    for (const [module, funcs] of Object.entries(JS_STDLIB)) {
      if (funcs.includes(name)) return module;
    }
    for (const [module, funcs] of Object.entries(JS_THIRD_PARTY)) {
      if (funcs.includes(name)) return module;
    }
  }
  
  return null;
}

/**
 * Check if an import statement is valid
 */
export function isValidImport(importPath: string, name: string, language: string): boolean {
  if (language === 'python') {
    // Check if importing from known libraries
    const knownModules = [
      ...Object.keys(PYTHON_STDLIB),
      ...Object.keys(PYTHON_THIRD_PARTY),
    ];
    
    for (const module of knownModules) {
      if (importPath.startsWith(module)) {
        const funcs = PYTHON_STDLIB[module] || PYTHON_THIRD_PARTY[module] || [];
        if (funcs.includes(name)) return true;
      }
    }
  } else if (language === 'javascript' || language === 'typescript') {
    // Check if importing from known libraries
    const knownModules = [
      ...Object.keys(JS_STDLIB),
      ...Object.keys(JS_THIRD_PARTY),
    ];
    
    for (const module of knownModules) {
      if (importPath === module || importPath.startsWith(module + '/')) {
        const funcs = JS_STDLIB[module] || JS_THIRD_PARTY[module] || [];
        if (funcs.includes(name)) return true;
      }
    }
  }
  
  return false;
}
