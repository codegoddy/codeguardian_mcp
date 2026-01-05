/**
 * Real-World Test: E-Commerce Application
 * Tests CodeGuardian with a realistic e-commerce codebase
 */

import { comprehensiveAnalysis } from '../../dist/analyzers/unifiedAnalyzer.js';

async function testEcommerceApp() {
  console.log('🛒 Real-World Test: E-Commerce Application\n');
  console.log('='.repeat(70));
  
  // Existing e-commerce codebase
  const existingCodebase = `
// User Service
class UserService {
  async login(email, password) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    const valid = await this.verifyPassword(password, user.password);
    return valid ? user : null;
  }

  async findByEmail(email) {
    return await db.users.findOne({ email });
  }

  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  async createUser(data) {
    const user = await db.users.create(data);
    return user;
  }
}

// Product Service
class ProductService {
  async getProduct(id) {
    return await db.products.findById(id);
  }

  async listProducts(filters) {
    return await db.products.find(filters);
  }

  async updateStock(productId, quantity) {
    return await db.products.updateOne(
      { _id: productId },
      { $inc: { stock: quantity } }
    );
  }
}

// Order Service
class OrderService {
  async createOrder(userId, items) {
    const order = await db.orders.create({
      userId,
      items,
      status: 'pending',
      createdAt: new Date()
    });
    return order;
  }

  async getOrder(orderId) {
    return await db.orders.findById(orderId);
  }
}
`;

  // AI-generated code with multiple issues
  const aiGeneratedCode = `
// AI-generated checkout handler with issues

const SECRET_KEY = "sk_live_1234567890abcdefghijklmnop";  // SECURITY: Hardcoded secret
const API_URL = "http://api.payment.com";  // SECURITY: Insecure HTTP

async function processCheckout(userId, cartItems) {
  // HALLUCINATION: authenticateUser doesn't exist
  const user = await authenticateUser(userId);
  
  // ANTI-PATTERN: Missing null check
  const email = user.email;
  
  // HALLUCINATION: validateCart doesn't exist
  const validCart = await validateCart(cartItems);
  
  let totalPrice = 0;
  for (let item of cartItems) {
    // ANTI-PATTERN: String concatenation in loop
    let description = "";
    description += item.name + " - " + item.price;
    
    // HALLUCINATION: getProductDetails doesn't exist
    const product = await getProductDetails(item.productId);
    
    // ANTI-PATTERN: Magic number
    if (product.stock < 5) {
      console.log("Low stock warning");  // ANTI-PATTERN: console.log
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
  
  return { success: true, total: totalPrice };
}

// ANTI-PATTERN: Missing input validation
function calculateDiscount(price, code) {
  // ANTI-PATTERN: Magic numbers
  if (code === "SAVE10") return price * 0.9;
  if (code === "SAVE20") return price * 0.8;
  return price;
}

// SECURITY: Eval usage
function applyDynamicPricing(formula) {
  return eval(formula);  // CRITICAL SECURITY ISSUE
}
`;

  console.log('\n📝 SCENARIO: E-Commerce Checkout System');
  console.log('   Existing: UserService, ProductService, OrderService');
  console.log('   AI Code: Checkout handler with multiple issues\n');

  console.log('⚡ RUNNING COMPREHENSIVE ANALYSIS...\n');
  
  const startTime = Date.now();

  try {
    const result = await comprehensiveAnalysis(
      aiGeneratedCode,
      existingCodebase,
      'javascript'
    );
    
    const elapsedTime = Date.now() - startTime;

    console.log('='.repeat(70));
    console.log('\n📊 ANALYSIS RESULTS\n');
    console.log(`⏱️  Total Analysis Time: ${result.analysisTime}ms`);
    console.log(`🌐 Language: ${result.language} (${result.languageConfidence}% confidence)`);
    console.log(`\n📈 OVERALL SCORE: ${result.overallScore}/100`);
    console.log(`   Security Score: ${result.securityScore}/100`);
    console.log(`   Quality Score: ${result.qualityScore}/100`);
    console.log(`\n🐛 TOTAL ISSUES: ${result.totalIssues}`);
    console.log(`   🔴 Critical: ${result.criticalIssues}`);
    console.log(`   🟠 High: ${result.highIssues}`);
    console.log(`   🟡 Medium: ${result.mediumIssues}`);
    console.log(`   🟢 Low: ${result.lowIssues}`);

    console.log('\n📊 BREAKDOWN BY CATEGORY:\n');
    console.log(`   Hallucinations: ${result.summary.hallucinations}`);
    console.log(`   Security Issues: ${result.summary.security.total}`);
    console.log(`   Anti-Patterns: ${result.summary.antiPatterns.total}`);

    if (result.hallucinations.length > 0) {
      console.log('\n🔍 HALLUCINATIONS DETECTED:\n');
      result.hallucinations.slice(0, 5).forEach((h, idx) => {
        const funcName = h.message.match(/'([^']+)'/)?.[1];
        console.log(`${idx + 1}. ${funcName}() - Line ${h.line}`);
      });
      if (result.hallucinations.length > 5) {
        console.log(`   ... and ${result.hallucinations.length - 5} more`);
      }
    }

    if (result.securityVulnerabilities.length > 0) {
      console.log('\n🔒 SECURITY VULNERABILITIES:\n');
      result.securityVulnerabilities.slice(0, 5).forEach((v, idx) => {
        console.log(`${idx + 1}. ${v.name} (${v.severity.toUpperCase()}) - Line ${v.line}`);
      });
      if (result.securityVulnerabilities.length > 5) {
        console.log(`   ... and ${result.securityVulnerabilities.length - 5} more`);
      }
    }

    if (result.antiPatterns.length > 0) {
      console.log('\n🤖 AI ANTI-PATTERNS:\n');
      result.antiPatterns.slice(0, 5).forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.name} (${p.severity.toUpperCase()}) - Line ${p.line}`);
      });
      if (result.antiPatterns.length > 5) {
        console.log(`   ... and ${result.antiPatterns.length - 5} more`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n🎯 ASSESSMENT\n');
    
    const riskLevel = result.overallScore >= 80 ? '🟢 LOW' : 
                     result.overallScore >= 60 ? '🟡 MEDIUM' : '🔴 HIGH';
    console.log(`   Risk Level: ${riskLevel}`);
    console.log(`   Production Ready: ${result.overallScore >= 80 ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   Requires Fixes: ${result.totalIssues} issues`);
    console.log(`   Estimated Fix Time: ${Math.ceil(result.totalIssues * 5 / 60)} hours`);

    console.log('\n💡 RECOMMENDATIONS:\n');
    if (result.criticalIssues > 0) {
      console.log(`   1. Fix ${result.criticalIssues} critical security issues immediately`);
    }
    if (result.summary.hallucinations > 0) {
      console.log(`   2. Implement ${result.summary.hallucinations} missing functions`);
    }
    if (result.highIssues > 0) {
      console.log(`   3. Address ${result.highIssues} high-severity issues`);
    }
    console.log(`   4. Refactor code to fix ${result.summary.antiPatterns.total} anti-patterns`);

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ E-COMMERCE TEST COMPLETE!\n');
    console.log('CodeGuardian successfully analyzed a real-world e-commerce scenario:');
    console.log(`   ✅ Detected ${result.summary.hallucinations} hallucinations`);
    console.log(`   ✅ Found ${result.summary.security.total} security vulnerabilities`);
    console.log(`   ✅ Identified ${result.summary.antiPatterns.total} anti-patterns`);
    console.log(`   ✅ Analysis time: ${result.analysisTime}ms`);
    console.log(`   ✅ Overall score: ${result.overallScore}/100\n`);

    return {
      success: true,
      totalIssues: result.totalIssues,
      analysisTime: result.analysisTime,
      overallScore: result.overallScore,
    };

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Run the test
testEcommerceApp()
  .then(result => {
    console.log(`✅ Real-world e-commerce test completed!`);
    console.log(`   Issues found: ${result.totalIssues}`);
    console.log(`   Analysis time: ${result.analysisTime}ms`);
    console.log(`   Overall score: ${result.overallScore}/100\n`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
