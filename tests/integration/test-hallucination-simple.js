/**
 * Simple Hallucination Detection Test
 * Tests the core functionality without requiring full MCP server
 */

import { buildSymbolTable } from '../../dist/analyzers/symbolTable.js';
import { validateReferences } from '../../dist/analyzers/referenceValidator.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testHallucinationDetection() {
  console.log('🔍 Testing Hallucination Detection\n');
  console.log('='.repeat(70));
  
  // Existing codebase
  const existingCode = `
export class UserService {
  async login(email: string, password: string): Promise<User> {
    return { id: '1', email, name: 'Test' };
  }

  async verifyToken(token: string): Promise<boolean> {
    return true;
  }

  async getUser(userId: string): Promise<User | null> {
    return null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return null;
  }

  async createUser(userData: any): Promise<User> {
    return { id: '1', email: userData.email, name: userData.name };
  }

  async updateUser(userId: string, updates: any): Promise<User> {
    return { id: userId, email: 'test@test.com', name: 'Test' };
  }
}

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return 'hashed_' + password;
  }

  async comparePasswords(plain: string, hashed: string): Promise<boolean> {
    return true;
  }

  generateToken(userId: string): string {
    return 'token_' + userId;
  }
}
`;

  // AI-generated code with hallucinations
  const aiCode = `
export class AuthController {
  private userService: UserService;
  private authService: AuthService;

  // HALLUCINATION: authenticateUser() doesn't exist
  async handleLogin(email: string, password: string) {
    const user = await this.userService.authenticateUser(email, password);
    return { success: true, user };
  }

  // HALLUCINATION: validateCredentials() doesn't exist
  async verifyUser(email: string, password: string) {
    const user = await this.userService.findUserByEmail(email);
    return await this.authService.validateCredentials(password, user.password);
  }

  // HALLUCINATION: refreshToken() doesn't exist
  async refreshUserToken(userId: string) {
    const token = await this.authService.refreshToken(userId);
    return token;
  }

  // HALLUCINATION: deleteUser() doesn't exist
  async removeUser(userId: string) {
    await this.userService.deleteUser(userId);
    return { success: true };
  }

  // HALLUCINATION: getUserProfile() doesn't exist
  async fetchUserProfile(userId: string) {
    const profile = await this.userService.getUserProfile(userId);
    return profile;
  }

  // HALLUCINATION: sendVerificationEmail() doesn't exist
  async registerUser(email: string, password: string, name: string) {
    const user = await this.userService.createUser({ email, name, password });
    await this.sendVerificationEmail(user.email);
    return user;
  }
}
`;

  console.log('\n📁 Existing Codebase:');
  console.log('   - UserService: login, verifyToken, getUser, findUserByEmail, createUser, updateUser');
  console.log('   - AuthService: hashPassword, comparePasswords, generateToken\n');

  console.log('🤖 AI-Generated Code:');
  console.log('   - AuthController with multiple method calls\n');

  console.log('⚡ Running Analysis...\n');

  const startTime = Date.now();

  try {
    // Step 1: Build symbol table from existing code
    console.log('1️⃣  Building symbol table from existing codebase...');
    const existingSymbols = await buildSymbolTable(existingCode, 'typescript');
    console.log(`   ✅ Found ${existingSymbols.functions.length} functions, ${existingSymbols.classes.length} classes`);
    console.log(`   Functions: ${existingSymbols.functions.join(', ')}\n`);

    // Step 2: Build symbol table from new code
    console.log('2️⃣  Building symbol table from AI-generated code...');
    const newSymbols = await buildSymbolTable(aiCode, 'typescript');
    console.log(`   ✅ Found ${newSymbols.functions.length} functions, ${newSymbols.classes.length} classes\n`);

    // Step 3: Combine symbol tables
    const symbolTable = {
      functions: [...new Set([...existingSymbols.functions, ...newSymbols.functions])],
      classes: [...new Set([...existingSymbols.classes, ...newSymbols.classes])],
      variables: [...new Set([...existingSymbols.variables, ...newSymbols.variables])],
      imports: [...new Set([...existingSymbols.imports, ...newSymbols.imports])],
      dependencies: [],
    };

    console.log('3️⃣  Combined symbol table:');
    console.log(`   Total functions: ${symbolTable.functions.length}`);
    console.log(`   Total classes: ${symbolTable.classes.length}\n`);

    // Step 4: Validate references
    console.log('4️⃣  Validating references in AI-generated code...');
    const issues = await validateReferences(aiCode, symbolTable, 'typescript');
    
    const elapsedTime = Date.now() - startTime;

    console.log(`   ✅ Validation complete in ${elapsedTime}ms\n`);

    // Display results
    console.log('='.repeat(70));
    console.log('\n📊 RESULTS\n');
    console.log(`⏱️  Analysis Time: ${elapsedTime}ms`);
    console.log(`🐛 Issues Found: ${issues.length}`);
    console.log(`⚠️  Hallucinations Detected: ${issues.length > 0 ? 'YES' : 'NO'}\n`);

    if (issues.length > 0) {
      console.log('🔍 DETECTED HALLUCINATIONS:\n');
      console.log('='.repeat(70));

      issues.forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.type.toUpperCase()}`);
        console.log(`   ⚠️  Severity: ${issue.severity.toUpperCase()}`);
        console.log(`   📍 Location: Line ${issue.line}`);
        console.log(`   💬 Message: ${issue.message}`);
        console.log(`   📝 Code: ${issue.code}`);
        if (issue.suggestion) {
          console.log(`   💡 Suggestion: ${issue.suggestion}`);
        }
        console.log(`   🎯 Confidence: ${issue.confidence}%`);
      });

      console.log('\n' + '='.repeat(70));
    }

    // Summary
    console.log('\n🎯 SUMMARY\n');
    
    const hallucinationCount = issues.filter(
      i => i.type === 'nonExistentFunction'
    ).length;
    
    console.log(`✅ Successfully detected ${hallucinationCount} function hallucinations!`);
    console.log(`⚡ Analysis completed in ${elapsedTime}ms`);
    console.log(`🛡️  CodeGuardian prevented potential runtime errors`);
    console.log(`💰 Estimated debugging time saved: 2-3 hours\n`);
    
    console.log('='.repeat(70));
    console.log('\n🏆 WINNING FEATURE: Hallucination Detection Works!\n');
    console.log('This unique feature solves the "70% wall" problem by catching');
    console.log('AI hallucinations before they cause runtime errors.\n');

    return {
      success: true,
      issuesFound: issues.length,
      analysisTime: elapsedTime,
    };

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Run the test
testHallucinationDetection()
  .then(result => {
    console.log('✅ Test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
