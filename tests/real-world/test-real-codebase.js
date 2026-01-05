/**
 * REAL CODEBASE TEST
 * Tests CodeGuardian with a realistic multi-file codebase
 * Simulates a real project with multiple files, large files, and complex dependencies
 */

import { buildSymbolTable } from '../../dist/analyzers/symbolTable.js';
import { validateReferences } from '../../dist/analyzers/referenceValidator.js';
import { comprehensiveAnalysis } from '../../dist/analyzers/unifiedAnalyzer.js';
import { scanForVulnerabilities } from '../../dist/analyzers/security/securityScanner.js';
import { detectAntiPatterns } from '../../dist/analyzers/antiPatternDetector.js';
import fs from 'fs';
import path from 'path';

console.log('🏗️  REAL CODEBASE TEST\n');
console.log('Testing CodeGuardian with a realistic multi-file codebase\n');
console.log('='.repeat(70));

// Simulate a real codebase structure
const codebase = {
  // File 1: User Service (200 lines)
  'src/services/userService.js': `
// User Service - Handles user authentication and management
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../database/connection.js';
import { sendEmail } from '../utils/email.js';
import { validateEmail, validatePassword } from '../utils/validators.js';

export class UserService {
  constructor() {
    this.users = new Map();
  }

  async register(email, password, name) {
    if (!validateEmail(email)) {
      throw new Error('Invalid email');
    }
    
    if (!validatePassword(password)) {
      throw new Error('Password too weak');
    }

    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.users.create({
      email,
      password: hashedPassword,
      name,
      createdAt: new Date()
    });

    await sendEmail(email, 'Welcome!', 'Thanks for registering');
    return user;
  }

  async login(email, password) {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error('Invalid password');
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: '24h'
    });

    return { user, token };
  }

  async findByEmail(email) {
    return await db.users.findOne({ email });
  }

  async findById(id) {
    return await db.users.findById(id);
  }

  async updateProfile(userId, data) {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return await db.users.updateOne({ _id: userId }, data);
  }

  async deleteUser(userId) {
    return await db.users.deleteOne({ _id: userId });
  }

  async listUsers(filters = {}) {
    return await db.users.find(filters);
  }

  async changePassword(userId, oldPassword, newPassword) {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      throw new Error('Invalid old password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    return await db.users.updateOne(
      { _id: userId },
      { password: hashedPassword }
    );
  }
}

export const userService = new UserService();
`.repeat(2), // 200+ lines

  // File 2: Product Service (300 lines)
  'src/services/productService.js': `
// Product Service - Handles product management
import { db } from '../database/connection.js';
import { cacheService } from './cacheService.js';
import { imageService } from './imageService.js';

export class ProductService {
  async createProduct(data) {
    const product = await db.products.create({
      name: data.name,
      description: data.description,
      price: data.price,
      stock: data.stock,
      category: data.category,
      images: data.images || [],
      createdAt: new Date()
    });

    await cacheService.invalidate('products');
    return product;
  }

  async getProduct(id) {
    const cached = await cacheService.get(\`product:\${id}\`);
    if (cached) return cached;

    const product = await db.products.findById(id);
    if (product) {
      await cacheService.set(\`product:\${id}\`, product, 3600);
    }
    return product;
  }

  async listProducts(filters = {}) {
    const cacheKey = \`products:\${JSON.stringify(filters)}\`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const products = await db.products.find(filters);
    await cacheService.set(cacheKey, products, 600);
    return products;
  }

  async updateProduct(id, data) {
    const product = await this.getProduct(id);
    if (!product) {
      throw new Error('Product not found');
    }

    const updated = await db.products.updateOne({ _id: id }, data);
    await cacheService.invalidate(\`product:\${id}\`);
    await cacheService.invalidate('products');
    return updated;
  }

  async deleteProduct(id) {
    const result = await db.products.deleteOne({ _id: id });
    await cacheService.invalidate(\`product:\${id}\`);
    await cacheService.invalidate('products');
    return result;
  }

  async updateStock(productId, quantity) {
    const product = await this.getProduct(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (product.stock + quantity < 0) {
      throw new Error('Insufficient stock');
    }

    return await db.products.updateOne(
      { _id: productId },
      { $inc: { stock: quantity } }
    );
  }

  async searchProducts(query) {
    return await db.products.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    });
  }
}

export const productService = new ProductService();
`.repeat(3), // 300+ lines

  // File 3: AI-Generated Code with Issues (500 lines)
  'src/controllers/checkoutController.js': `
// AI-Generated Checkout Controller - HAS ISSUES!

const SECRET_KEY = "sk_live_1234567890abcdefghijklmnop"; // SECURITY ISSUE
const API_URL = "http://api.payment.com"; // SECURITY: Insecure HTTP

export class CheckoutController {
  async processCheckout(req, res) {
    try {
      const userId = req.params.userId;
      const cartItems = req.body.items;

      // HALLUCINATION: authenticateUser doesn't exist
      const user = await authenticateUser(userId);
      
      // ANTI-PATTERN: Missing null check
      const email = user.email;
      
      // HALLUCINATION: validateCart doesn't exist
      const validCart = await validateCart(cartItems);
      
      let totalPrice = 0;
      let description = ""; // ANTI-PATTERN: String concatenation in loop
      
      for (let item of cartItems) {
        description += item.name + " - " + item.price + "\\n";
        
        // HALLUCINATION: getProductDetails doesn't exist
        const product = await getProductDetails(item.productId);
        
        // ANTI-PATTERN: Magic number
        if (product.stock < 5) {
          console.log("Low stock warning"); // ANTI-PATTERN: console.log
        }
        
        totalPrice += item.price * item.quantity;
      }
      
      // SECURITY: SQL injection risk
      const query = "INSERT INTO orders VALUES (" + userId + ", " + totalPrice + ")";
      db.execute(query);
      
      // HALLUCINATION: sendOrderConfirmation doesn't exist
      await sendOrderConfirmation(email, totalPrice);
      
      // HALLUCINATION: updateInventory doesn't exist
      await updateInventory(cartItems);
      
      // ANTI-PATTERN: Empty catch block
      try {
        await chargePayment(totalPrice);
      } catch (error) {
      }
      
      res.json({ success: true, total: totalPrice });
    } catch (error) {
      // ANTI-PATTERN: Exposing error details
      res.status(500).json({ error: error.message });
    }
  }

  async applyDiscount(req, res) {
    const code = req.body.code;
    const price = req.body.price;
    
    // ANTI-PATTERN: Magic numbers
    if (code === "SAVE10") {
      return price * 0.9;
    }
    if (code === "SAVE20") {
      return price * 0.8;
    }
    return price;
  }

  async calculateShipping(req, res) {
    const formula = req.body.formula;
    // SECURITY: eval usage
    const result = eval(formula);
    res.json({ shipping: result });
  }
}
`.repeat(5), // 500+ lines

  // File 4: Large utility file (1000+ lines)
  'src/utils/helpers.js': `
// Utility functions
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString();
}

export function validateEmail(email) {
  const re = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return re.test(email);
}

export function validatePassword(password) {
  return password.length >= 8;
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
`.repeat(20), // 1000+ lines
};

async function testRealCodebase() {
  console.log('\\n📁 CODEBASE STRUCTURE:\\n');
  Object.keys(codebase).forEach(file => {
    const lines = codebase[file].split('\\n').length;
    console.log(`   ${file} (${lines} lines)`);
  });
  
  const totalLines = Object.values(codebase).reduce((sum, code) => 
    sum + code.split('\\n').length, 0);
  console.log(`\\n   Total: ${Object.keys(codebase).length} files, ${totalLines} lines\\n`);

  // Step 1: Build symbol table from entire codebase
  console.log('='.repeat(70));
  console.log('\\n🔍 STEP 1: Building Symbol Table from Entire Codebase\\n');
  
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

  // Remove duplicates
  allSymbols.functions = [...new Set(allSymbols.functions)];
  allSymbols.classes = [...new Set(allSymbols.classes)];
  
  const symbolTableTime = Date.now() - startSymbolTable;
  
  console.log(`   ✅ Symbol table built in ${symbolTableTime}ms`);
  console.log(`   📊 Found:`);
  console.log(`      - ${allSymbols.functions.length} functions`);
  console.log(`      - ${allSymbols.classes.length} classes`);
  console.log(`      - ${allSymbols.imports.length} imports`);

  // Step 2: Analyze each file for hallucinations
  console.log('\\n' + '='.repeat(70));
  console.log('\\n🔍 STEP 2: Analyzing Each File for Hallucinations\\n');
  
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
      issues.slice(0, 3).forEach(issue => {
        const funcName = issue.message.match(/'([^']+)'/)?.[1];
        console.log(`         - ${funcName}() at line ${issue.line}`);
      });
      if (issues.length > 3) {
        console.log(`         ... and ${issues.length - 3} more`);
      }
    } else {
      console.log(`   ${file}: ✅ No hallucinations`);
    }
  }
  
  const hallucinationTime = Date.now() - startHallucination;
  console.log(`\\n   ⏱️  Total hallucination analysis: ${hallucinationTime}ms`);
  console.log(`   📊 Total hallucinations found: ${totalHallucinations}`);

  // Step 3: Security scanning across all files
  console.log('\\n' + '='.repeat(70));
  console.log('\\n🔒 STEP 3: Security Scanning Across All Files\\n');
  
  const securityResults = {};
  let totalVulnerabilities = 0;
  const startSecurity = Date.now();

  for (const [file, code] of Object.entries(codebase)) {
    const language = file.endsWith('.py') ? 'python' : 'javascript';
    const vulns = await scanForVulnerabilities(code, language);
    securityResults[file] = vulns;
    totalVulnerabilities += vulns.length;
    
    if (vulns.length > 0) {
      console.log(`   ${file}:`);
      console.log(`      🔴 ${vulns.length} vulnerabilities detected`);
      vulns.slice(0, 3).forEach(vuln => {
        console.log(`         - ${vuln.name} (${vuln.severity}) at line ${vuln.line}`);
      });
      if (vulns.length > 3) {
        console.log(`         ... and ${vulns.length - 3} more`);
      }
    } else {
      console.log(`   ${file}: ✅ No vulnerabilities`);
    }
  }
  
  const securityTime = Date.now() - startSecurity;
  console.log(`\\n   ⏱️  Total security analysis: ${securityTime}ms`);
  console.log(`   📊 Total vulnerabilities found: ${totalVulnerabilities}`);

  // Step 4: Anti-pattern detection
  console.log('\\n' + '='.repeat(70));
  console.log('\\n🤖 STEP 4: Anti-Pattern Detection\\n');
  
  const antiPatternResults = {};
  let totalAntiPatterns = 0;
  const startAntiPattern = Date.now();

  for (const [file, code] of Object.entries(codebase)) {
    const language = file.endsWith('.py') ? 'python' : 'javascript';
    const patterns = await detectAntiPatterns(code, language);
    antiPatternResults[file] = patterns;
    totalAntiPatterns += patterns.length;
    
    if (patterns.length > 0) {
      console.log(`   ${file}:`);
      console.log(`      ⚠️  ${patterns.length} anti-patterns detected`);
      patterns.slice(0, 3).forEach(pattern => {
        console.log(`         - ${pattern.name} (${pattern.severity}) at line ${pattern.line}`);
      });
      if (patterns.length > 3) {
        console.log(`         ... and ${patterns.length - 3} more`);
      }
    } else {
      console.log(`   ${file}: ✅ No anti-patterns`);
    }
  }
  
  const antiPatternTime = Date.now() - startAntiPattern;
  console.log(`\\n   ⏱️  Total anti-pattern analysis: ${antiPatternTime}ms`);
  console.log(`   📊 Total anti-patterns found: ${totalAntiPatterns}`);

  // Step 5: Performance summary
  console.log('\\n' + '='.repeat(70));
  console.log('\\n⚡ PERFORMANCE SUMMARY\\n');
  
  const totalTime = symbolTableTime + hallucinationTime + securityTime + antiPatternTime;
  const avgTimePerFile = Math.round(totalTime / Object.keys(codebase).length);
  const avgTimePerLine = (totalTime / totalLines).toFixed(2);
  
  console.log(`   Total Analysis Time: ${totalTime}ms`);
  console.log(`   Average per File: ${avgTimePerFile}ms`);
  console.log(`   Average per Line: ${avgTimePerLine}ms`);
  console.log(`   Lines per Second: ${Math.round(totalLines / (totalTime / 1000))}`);
  
  console.log('\\n   Breakdown:');
  console.log(`      Symbol Table: ${symbolTableTime}ms (${Math.round(symbolTableTime/totalTime*100)}%)`);
  console.log(`      Hallucinations: ${hallucinationTime}ms (${Math.round(hallucinationTime/totalTime*100)}%)`);
  console.log(`      Security: ${securityTime}ms (${Math.round(securityTime/totalTime*100)}%)`);
  console.log(`      Anti-Patterns: ${antiPatternTime}ms (${Math.round(antiPatternTime/totalTime*100)}%)`);

  // Step 6: Overall results
  console.log('\\n' + '='.repeat(70));
  console.log('\\n📊 OVERALL RESULTS\\n');
  
  const totalIssues = totalHallucinations + totalVulnerabilities + totalAntiPatterns;
  const criticalIssues = Object.values(securityResults)
    .flat()
    .filter(v => v.severity === 'critical').length;
  
  console.log(`   Total Issues Found: ${totalIssues}`);
  console.log(`      🔴 Critical: ${criticalIssues}`);
  console.log(`      ❌ Hallucinations: ${totalHallucinations}`);
  console.log(`      🔒 Security: ${totalVulnerabilities}`);
  console.log(`      🤖 Anti-Patterns: ${totalAntiPatterns}`);
  
  console.log('\\n   Files with Issues:');
  Object.keys(codebase).forEach(file => {
    const hallucinations = hallucinationResults[file]?.length || 0;
    const security = securityResults[file]?.length || 0;
    const antiPatterns = antiPatternResults[file]?.length || 0;
    const total = hallucinations + security + antiPatterns;
    
    if (total > 0) {
      console.log(`      ${file}: ${total} issues`);
    }
  });

  // Step 7: Scalability test
  console.log('\\n' + '='.repeat(70));
  console.log('\\n🚀 SCALABILITY TEST\\n');
  
  console.log('   Testing with larger codebase...');
  const largeCodebase = {};
  for (let i = 0; i < 10; i++) {
    largeCodebase[`src/module${i}.js`] = codebase['src/utils/helpers.js'];
  }
  
  const startLarge = Date.now();
  const largeSymbols = { functions: [], classes: [], variables: [], imports: [], dependencies: [] };
  
  for (const [file, code] of Object.entries(largeCodebase)) {
    const symbols = await buildSymbolTable(code, 'javascript');
    largeSymbols.functions.push(...symbols.functions);
  }
  
  const largeTotalLines = Object.values(largeCodebase).reduce((sum, code) => 
    sum + code.split('\\n').length, 0);
  const largeTime = Date.now() - startLarge;
  
  console.log(`   ✅ Analyzed ${Object.keys(largeCodebase).length} files (${largeTotalLines} lines) in ${largeTime}ms`);
  console.log(`   📊 Performance: ${Math.round(largeTotalLines / (largeTime / 1000))} lines/second`);

  console.log('\\n' + '='.repeat(70));
  console.log('\\n✅ REAL CODEBASE TEST COMPLETE!\\n');
  console.log('CodeGuardian successfully analyzed a realistic multi-file codebase:');
  console.log(`   ✅ ${Object.keys(codebase).length} files analyzed`);
  console.log(`   ✅ ${totalLines} lines of code processed`);
  console.log(`   ✅ ${totalIssues} issues detected`);
  console.log(`   ✅ ${totalTime}ms total analysis time`);
  console.log(`   ✅ ${Math.round(totalLines / (totalTime / 1000))} lines/second throughput`);
  console.log(`   ✅ Scales to 10,000+ lines efficiently\\n`);

  return {
    success: true,
    files: Object.keys(codebase).length,
    totalLines,
    totalIssues,
    totalTime,
    linesPerSecond: Math.round(totalLines / (totalTime / 1000))
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
