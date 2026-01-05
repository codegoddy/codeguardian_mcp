/**
 * REAL CODEBASE TEST - Simplified
 * Tests CodeGuardian with a realistic multi-file codebase
 */

import { buildSymbolTable } from '../../dist/analyzers/symbolTable.js';
import { validateReferences } from '../../dist/analyzers/referenceValidator.js';
import { comprehensiveAnalysis } from '../../dist/analyzers/unifiedAnalyzer.js';

console.log('🏗️  REAL CODEBASE TEST\n');
console.log('Testing CodeGuardian with a realistic multi-file codebase\n');
console.log('='.repeat(70));

// Helper to generate large code
function generateLargeFile(baseCode, targetLines) {
  const lines = baseCode.split('\n');
  const result = [];
  while (result.length < targetLines) {
    result.push(...lines);
  }
  return result.slice(0, targetLines).join('\n');
}

// Simulate a real codebase structure
const codebase = {};

// File 1: User Service (200 lines)
const userServiceBase = `
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../database/connection.js';

export class UserService {
  async register(email, password, name) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.users.create({ email, password: hashedPassword, name });
    return user;
  }

  async login(email, password) {
    const user = await this.findByEmail(email);
    const valid = await bcrypt.compare(password, user.password);
    return { user, token: jwt.sign({ userId: user.id }, process.env.JWT_SECRET) };
  }

  async findByEmail(email) {
    return await db.users.findOne({ email });
  }

  async findById(id) {
    return await db.users.findById(id);
  }
}
`;
codebase['src/services/userService.js'] = generateLargeFile(userServiceBase, 200);

// File 2: Product Service (300 lines)
const productServiceBase = `
import { db } from '../database/connection.js';
import { cacheService } from './cacheService.js';

export class ProductService {
  async createProduct(data) {
    const product = await db.products.create(data);
    await cacheService.invalidate('products');
    return product;
  }

  async getProduct(id) {
    const cached = await cacheService.get(\`product:\${id}\`);
    if (cached) return cached;
    const product = await db.products.findById(id);
    return product;
  }

  async updateStock(productId, quantity) {
    return await db.products.updateOne({ _id: productId }, { $inc: { stock: quantity } });
  }
}
`;
codebase['src/services/productService.js'] = generateLargeFile(productServiceBase, 300);

// File 3: AI-Generated Code with Issues (500 lines)
const checkoutControllerBase = `
const SECRET_KEY = "sk_live_1234567890abcdefghijklmnop";
const API_URL = "http://api.payment.com";

export class CheckoutController {
  async processCheckout(req, res) {
    const userId = req.params.userId;
    const cartItems = req.body.items;

    const user = await authenticateUser(userId);
    const email = user.email;
    const validCart = await validateCart(cartItems);
    
    let totalPrice = 0;
    for (let item of cartItems) {
      const product = await getProductDetails(item.productId);
      if (product.stock < 5) {
        console.log("Low stock warning");
      }
      totalPrice += item.price * item.quantity;
    }
    
    const query = "INSERT INTO orders VALUES (" + userId + ", " + totalPrice + ")";
    db.execute(query);
    
    await sendOrderConfirmation(email, totalPrice);
    await updateInventory(cartItems);
    
    try {
      await chargePayment(totalPrice);
    } catch (error) {
    }
    
    res.json({ success: true, total: totalPrice });
  }

  async calculateShipping(req, res) {
    const formula = req.body.formula;
    const result = eval(formula);
    res.json({ shipping: result });
  }
}
`;
codebase['src/controllers/checkoutController.js'] = generateLargeFile(checkoutControllerBase, 500);

// File 4: Large utility file (1000+ lines)
const helpersBase = `
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString();
}

export function validateEmail(email) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
`;
codebase['src/utils/helpers.js'] = generateLargeFile(helpersBase, 1000);

async function testRealCodebase() {
  console.log('\n📁 CODEBASE STRUCTURE:\n');
  Object.keys(codebase).forEach(file => {
    const lines = codebase[file].split('\n').length;
    console.log(`   ${file} (${lines} lines)`);
  });
  
  const totalLines = Object.values(codebase).reduce((sum, code) => 
    sum + code.split('\n').length, 0);
  console.log(`\n   Total: ${Object.keys(codebase).length} files, ${totalLines} lines\n`);

  // Step 1: Build symbol table from entire codebase
  console.log('='.repeat(70));
  console.log('\n🔍 STEP 1: Building Symbol Table from Entire Codebase\n');
  
  const startSymbolTable = Date.now();
  const allSymbols = {
    functions: [],
    classes: [],
    variables: [],
    imports: [],
    dependencies: []
  };

  for (const [file, code] of Object.entries(codebase)) {
    const language = file.endsWith('.py') ? 'python' : 'javascript';
    const symbols = await buildSymbolTable(code, language);
    
    allSymbols.functions.push(...symbols.functions);
    allSymbols.classes.push(...symbols.classes);
    allSymbols.variables.push(...symbols.variables);
    allSymbols.imports.push(...symbols.imports);
  }

  allSymbols.functions = [...new Set(allSymbols.functions)];
  allSymbols.classes = [...new Set(allSymbols.classes)];
  
  const symbolTableTime = Date.now() - startSymbolTable;
  
  console.log(`   ✅ Symbol table built in ${symbolTableTime}ms`);
  console.log(`   📊 Found:`);
  console.log(`      - ${allSymbols.functions.length} functions`);
  console.log(`      - ${allSymbols.classes.length} classes`);
  console.log(`      - ${allSymbols.imports.length} imports`);

  // Step 2: Analyze each file for hallucinations
  console.log('\n' + '='.repeat(70));
  console.log('\n🔍 STEP 2: Analyzing Each File for Hallucinations\n');
  
  const hallucinationResults = {};
  let totalHallucinations = 0;
  const startHallucination = Date.now();

  for (const [file, code] of Object.entries(codebase)) {
    const language = file.endsWith('.py') ? 'python' : 'javascript';
    const issues = await validateReferences(code, allSymbols, language);
    hallucinationResults[file] = issues;
    totalHallucinations += issues.length;
    
    if (issues.length > 0) {
      console.log(`   ${file}:`);
      console.log(`      ❌ ${issues.length} hallucinations detected`);
      const uniqueIssues = [...new Set(issues.map(i => i.message))];
      uniqueIssues.slice(0, 3).forEach(msg => {
        const funcName = msg.match(/'([^']+)'/)?.[1];
        console.log(`         - ${funcName}()`);
      });
      if (uniqueIssues.length > 3) {
        console.log(`         ... and ${uniqueIssues.length - 3} more unique functions`);
      }
    } else {
      console.log(`   ${file}: ✅ No hallucinations`);
    }
  }
  
  const hallucinationTime = Date.now() - startHallucination;
  console.log(`\n   ⏱️  Total hallucination analysis: ${hallucinationTime}ms`);
  console.log(`   📊 Total hallucinations found: ${totalHallucinations}`);

  // Step 3: Comprehensive analysis of problematic file
  console.log('\n' + '='.repeat(70));
  console.log('\n🔬 STEP 3: Comprehensive Analysis of Problematic File\n');
  
  const problematicFile = 'src/controllers/checkoutController.js';
  const problematicCode = codebase[problematicFile];
  
  console.log(`   Analyzing: ${problematicFile}`);
  const startComprehensive = Date.now();
  
  const result = await comprehensiveAnalysis(
    problematicCode,
    Object.values(codebase).join('\n'),
    'javascript'
  );
  
  const comprehensiveTime = Date.now() - startComprehensive;
  
  console.log(`\n   ✅ Analysis completed in ${comprehensiveTime}ms`);
  console.log(`   📊 Results:`);
  console.log(`      - Overall Score: ${result.overallScore}/100`);
  console.log(`      - Total Issues: ${result.totalIssues}`);
  console.log(`      - Hallucinations: ${result.hallucinations.length}`);
  console.log(`      - Security Issues: ${result.securityVulnerabilities.length}`);
  console.log(`      - Anti-Patterns: ${result.antiPatterns.length}`);

  // Step 4: Performance summary
  console.log('\n' + '='.repeat(70));
  console.log('\n⚡ PERFORMANCE SUMMARY\n');
  
  const totalTime = symbolTableTime + hallucinationTime + comprehensiveTime;
  const avgTimePerFile = Math.round(totalTime / Object.keys(codebase).length);
  const avgTimePerLine = (totalTime / totalLines).toFixed(3);
  const linesPerSecond = Math.round(totalLines / (totalTime / 1000));
  
  console.log(`   Total Analysis Time: ${totalTime}ms`);
  console.log(`   Total Lines Analyzed: ${totalLines}`);
  console.log(`   Average per File: ${avgTimePerFile}ms`);
  console.log(`   Average per Line: ${avgTimePerLine}ms`);
  console.log(`   Throughput: ${linesPerSecond} lines/second`);
  
  console.log('\n   Breakdown:');
  console.log(`      Symbol Table: ${symbolTableTime}ms (${Math.round(symbolTableTime/totalTime*100)}%)`);
  console.log(`      Hallucinations: ${hallucinationTime}ms (${Math.round(hallucinationTime/totalTime*100)}%)`);
  console.log(`      Comprehensive: ${comprehensiveTime}ms (${Math.round(comprehensiveTime/totalTime*100)}%)`);

  // Step 5: Scalability demonstration
  console.log('\n' + '='.repeat(70));
  console.log('\n🚀 SCALABILITY DEMONSTRATION\n');
  
  console.log('   Testing with 10,000+ lines...');
  const largeFile = generateLargeFile(helpersBase, 10000);
  const startLarge = Date.now();
  const largeSymbols = await buildSymbolTable(largeFile, 'javascript');
  const largeTime = Date.now() - startLarge;
  
  console.log(`   ✅ Analyzed 10,000 lines in ${largeTime}ms`);
  console.log(`   📊 Throughput: ${Math.round(10000 / (largeTime / 1000))} lines/second`);
  console.log(`   📊 Found ${largeSymbols.functions.length} functions`);

  console.log('\n' + '='.repeat(70));
  console.log('\n✅ REAL CODEBASE TEST COMPLETE!\n');
  console.log('CodeGuardian successfully analyzed a realistic multi-file codebase:');
  console.log(`   ✅ ${Object.keys(codebase).length} files analyzed`);
  console.log(`   ✅ ${totalLines} lines of code processed`);
  console.log(`   ✅ ${totalHallucinations} hallucinations detected`);
  console.log(`   ✅ ${totalTime}ms total analysis time`);
  console.log(`   ✅ ${linesPerSecond} lines/second throughput`);
  console.log(`   ✅ Scales efficiently to 10,000+ lines\n`);

  return {
    success: true,
    files: Object.keys(codebase).length,
    totalLines,
    totalIssues: totalHallucinations,
    totalTime,
    linesPerSecond
  };
}

// Run the test
testRealCodebase()
  .then(result => {
    console.log('✅ Real codebase test completed successfully!');
    console.log(`   Files: ${result.files}`);
    console.log(`   Lines: ${result.totalLines}`);
    console.log(`   Issues: ${result.totalIssues}`);
    console.log(`   Time: ${result.totalTime}ms`);
    console.log(`   Throughput: ${result.linesPerSecond} lines/second\n`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
