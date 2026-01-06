/**
 * Real-world testing of V2 architecture
 */

import { TreeSitterParser } from './analyzers/parsers/treeSitterParser.js';
import { SemanticIndexBuilder, SemanticQuery } from './analyzers/parsers/semanticIndex.js';

// Real-world AI-generated code samples with common hallucinations

const authServiceHallucination = `
class AuthenticationService {
  constructor(private db: Database) {}

  async login(username: string, password: string): Promise<User> {
    // HALLUCINATION: validateCredentials doesn't exist
    const isValid = await this.validateCredentials(username, password);
    
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // HALLUCINATION: getUserByUsername doesn't exist
    const user = await this.getUserByUsername(username);
    
    // HALLUCINATION: generateAuthToken doesn't exist
    const token = this.generateAuthToken(user);
    
    // HALLUCINATION: updateLastLogin doesn't exist
    await this.updateLastLogin(user.id);
    
    return user;
  }

  async register(email: string, password: string): Promise<User> {
    // HALLUCINATION: hashPassword doesn't exist
    const hashedPassword = await this.hashPassword(password);
    
    // HALLUCINATION: createUser doesn't exist
    const user = await this.createUser(email, hashedPassword);
    
    // HALLUCINATION: sendWelcomeEmail doesn't exist
    await this.sendWelcomeEmail(user.email);
    
    return user;
  }
}
`;

const ecommerceHallucination = `
class ShoppingCart {
  private items: CartItem[] = [];

  addItem(product: Product, quantity: number) {
    // HALLUCINATION: validateStock doesn't exist
    if (!this.validateStock(product.id, quantity)) {
      throw new Error('Insufficient stock');
    }

    // HALLUCINATION: calculateDiscount doesn't exist
    const discount = this.calculateDiscount(product);
    
    // HALLUCINATION: applyPromotions doesn't exist
    const finalPrice = this.applyPromotions(product.price, discount);
    
    this.items.push({ product, quantity, price: finalPrice });
  }

  checkout() {
    // HALLUCINATION: validatePaymentMethod doesn't exist
    this.validatePaymentMethod();
    
    // HALLUCINATION: processPayment doesn't exist
    const payment = this.processPayment(this.getTotal());
    
    // HALLUCINATION: createOrder doesn't exist
    const order = this.createOrder(this.items, payment);
    
    // HALLUCINATION: sendOrderConfirmation doesn't exist
    this.sendOrderConfirmation(order);
    
    return order;
  }

  getTotal(): number {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }
}
`;

const apiClientHallucination = `
class ApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  async fetchUsers(): Promise<User[]> {
    // HALLUCINATION: buildHeaders doesn't exist
    const headers = this.buildHeaders();
    
    // HALLUCINATION: makeRequest doesn't exist
    const response = await this.makeRequest('/users', { headers });
    
    // HALLUCINATION: validateResponse doesn't exist
    this.validateResponse(response);
    
    // HALLUCINATION: transformData doesn't exist
    return this.transformData(response.data);
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    // HALLUCINATION: sanitizeInput doesn't exist
    const sanitized = this.sanitizeInput(data);
    
    // HALLUCINATION: makeRequest doesn't exist
    const response = await this.makeRequest(\`/users/\${userId}\`, {
      method: 'PUT',
      body: sanitized
    });
    
    // HALLUCINATION: handleError doesn't exist
    if (response.error) {
      this.handleError(response.error);
    }
    
    return response.data;
  }
}
`;

const correctCode = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Division by zero');
    }
    return a / b;
  }

  calculate(operation: string, a: number, b: number): number {
    switch (operation) {
      case 'add':
        return this.add(a, b);
      case 'subtract':
        return this.subtract(a, b);
      case 'multiply':
        return this.multiply(a, b);
      case 'divide':
        return this.divide(a, b);
      default:
        throw new Error('Unknown operation');
    }
  }
}
`;

interface TestResult {
  name: string;
  codeSize: number;
  parseTime: number;
  hallucinationsDetected: number;
  expectedHallucinations: number;
  accuracy: number;
  details: string[];
}

async function testSample(
  name: string,
  code: string,
  expectedHallucinations: number
): Promise<TestResult> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(70));

  const parser = new TreeSitterParser();
  const startTime = Date.now();

  try {
    // Parse code
    const result = await parser.parse(code, `${name}.ts`, 'typescript');
    const parseTime = Date.now() - startTime;

    console.log(`✅ Parsed in ${parseTime}ms`);
    console.log(`   Symbols found: ${result.graph.symbols.size}`);

    // Build index
    const index = SemanticIndexBuilder.buildIndex(result.graph);
    const query = new SemanticQuery(index, result.graph);

    console.log(`   References tracked: ${result.graph.references.size}`);
    console.log(`   Unresolved references: ${index.unresolvedReferences.length}`);

    // Get detailed hallucinations
    const details: string[] = [];
    const hallucinations = new Set<string>();

    for (const ref of index.unresolvedReferences) {
      const key = `${ref.name}:${ref.location.line}`;
      if (!hallucinations.has(key)) {
        hallucinations.add(key);
        const similar = query.findSimilar(ref.name, 2);
        const suggestion = similar.length > 0
          ? ` (Did you mean '${similar[0].name}'?)`
          : '';
        
        const detail = `   🚨 Line ${ref.location.line}: '${ref.name}' does not exist${suggestion}`;
        details.push(detail);
        console.log(detail);
      }
    }

    const detected = hallucinations.size;
    const accuracy = expectedHallucinations > 0
      ? Math.min(100, (detected / expectedHallucinations) * 100)
      : (detected === 0 ? 100 : 0);

    console.log(`\n   Expected hallucinations: ${expectedHallucinations}`);
    console.log(`   Detected hallucinations: ${detected}`);
    console.log(`   Accuracy: ${accuracy.toFixed(1)}%`);

    return {
      name,
      codeSize: code.length,
      parseTime,
      hallucinationsDetected: detected,
      expectedHallucinations,
      accuracy,
      details
    };
  } catch (error) {
    console.error(`   ❌ Error:`, error);
    throw error;
  }
}

async function runRealWorldTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 REAL-WORLD TESTING - V2 ARCHITECTURE');
  console.log('='.repeat(70));

  const results: TestResult[] = [];

  // Test each sample
  const tests = [
    { name: 'Authentication Service', code: authServiceHallucination, expected: 7 },
    { name: 'E-commerce Cart', code: ecommerceHallucination, expected: 8 },
    { name: 'API Client', code: apiClientHallucination, expected: 7 },
    { name: 'Correct Code', code: correctCode, expected: 0 }
  ];

  for (const test of tests) {
    try {
      const result = await testSample(test.name, test.code, test.expected);
      results.push(result);
    } catch (error) {
      console.error(`Failed to test ${test.name}:`, error);
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 SUMMARY REPORT');
  console.log('='.repeat(70));

  const totalExpected = results.reduce((sum, r) => sum + r.expectedHallucinations, 0);
  const totalDetected = results.reduce((sum, r) => sum + r.hallucinationsDetected, 0);
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
  const avgParseTime = results.reduce((sum, r) => sum + r.parseTime, 0) / results.length;
  const totalCodeSize = results.reduce((sum, r) => sum + r.codeSize, 0);

  console.log('\n📋 Test Results:');
  console.log('─'.repeat(70));
  console.log('Sample'.padEnd(30) + 'Parse Time'.padEnd(15) + 'Detected'.padEnd(15) + 'Accuracy');
  console.log('─'.repeat(70));

  for (const result of results) {
    const name = result.name.padEnd(30);
    const parseTime = `${result.parseTime}ms`.padEnd(15);
    const detected = `${result.hallucinationsDetected}/${result.expectedHallucinations}`.padEnd(15);
    const accuracy = `${result.accuracy.toFixed(1)}%`;
    console.log(`${name}${parseTime}${detected}${accuracy}`);
  }

  console.log('─'.repeat(70));
  console.log(`${'AVERAGE'.padEnd(30)}${`${avgParseTime.toFixed(1)}ms`.padEnd(15)}${''.padEnd(15)}${avgAccuracy.toFixed(1)}%`);

  console.log('\n\n⚡ Performance Metrics:');
  console.log(`  • Total code analyzed: ${totalCodeSize} characters`);
  console.log(`  • Average parse time: ${avgParseTime.toFixed(1)}ms`);
  console.log(`  • Parse speed: ${(totalCodeSize / avgParseTime).toFixed(0)} chars/ms`);

  console.log('\n\n🎯 Hallucination Detection:');
  console.log(`  • Total expected: ${totalExpected}`);
  console.log(`  • Total detected: ${totalDetected}`);
  console.log(`  • Detection rate: ${((totalDetected / totalExpected) * 100).toFixed(1)}%`);
  console.log(`  • Average accuracy: ${avgAccuracy.toFixed(1)}%`);

  console.log('\n\n✅ Performance Targets:');
  const parseTarget = avgParseTime < 2000;
  const accuracyTarget = avgAccuracy > 80;
  
  console.log(`  ${parseTarget ? '✅' : '❌'} Parse time < 2s: ${avgParseTime.toFixed(1)}ms`);
  console.log(`  ${accuracyTarget ? '✅' : '❌'} Accuracy > 80%: ${avgAccuracy.toFixed(1)}%`);

  // False positives check
  const correctCodeResult = results.find(r => r.name === 'Correct Code');
  if (correctCodeResult) {
    const falsePositives = correctCodeResult.hallucinationsDetected;
    console.log(`  ${falsePositives === 0 ? '✅' : '❌'} No false positives: ${falsePositives} detected`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✨ Real-world testing complete!');
  console.log('='.repeat(70));

  return results;
}

// Run tests
runRealWorldTests().catch(console.error);
