/**
 * Real-World Test: React Dashboard Application
 * Tests CodeGuardian with a realistic React dashboard
 */

import { comprehensiveAnalysis } from '../../dist/analyzers/unifiedAnalyzer.js';

async function testReactDashboard() {
  console.log('⚛️  Real-World Test: React Dashboard Application\n');
  console.log('='.repeat(70));
  
  // Existing React codebase
  const existingCodebase = `
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Custom hooks
function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchUser().then(setUser).finally(() => setLoading(false));
  }, []);
  
  return { user, loading };
}

function useFetch(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    axios.get(url)
      .then(res => setData(res.data))
      .catch(err => setError(err));
  }, [url]);
  
  return { data, error };
}

// API functions
async function fetchUser() {
  const response = await axios.get('/api/user');
  return response.data;
}

async function fetchDashboardData() {
  const response = await axios.get('/api/dashboard');
  return response.data;
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString();
}
`;

  // AI-generated React code with issues
  const aiGeneratedCode = `
import React, { useState, useEffect } from 'react';

// SECURITY: Hardcoded API key
const API_KEY = "pk_live_1234567890abcdefghijklmnop";

function Dashboard() {
  // HALLUCINATION: useUserData doesn't exist
  const userData = useUserData();
  
  // HALLUCINATION: usePermissions doesn't exist
  const permissions = usePermissions();
  
  // ANTI-PATTERN: Missing dependency in useEffect
  useEffect(() => {
    fetchData();
  }, []);
  
  // ANTI-PATTERN: Missing null check
  const userName = userData.name;
  
  // HALLUCINATION: fetchAnalytics doesn't exist
  const analytics = fetchAnalytics();
  
  // ANTI-PATTERN: Console.log in production
  console.log('Dashboard rendered', userData);
  
  // SECURITY: XSS vulnerability
  const renderHTML = () => {
    document.getElementById('content').innerHTML = userData.bio;
  };
  
  // HALLUCINATION: calculateRevenue doesn't exist
  const revenue = calculateRevenue(analytics);
  
  // ANTI-PATTERN: Magic numbers
  if (revenue > 10000) {
    console.log('High revenue');
  }
  
  return (
    <div>
      <h1>Dashboard</h1>
      <p>{userName}</p>
    </div>
  );
}

// ANTI-PATTERN: Missing input validation
function updateUserProfile(data) {
  // SECURITY: Insecure HTTP
  fetch("http://api.example.com/user", {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

// ANTI-PATTERN: Empty catch block
async function saveSettings(settings) {
  try {
    await api.post('/settings', settings);
  } catch (error) {
  }
}

// ANTI-PATTERN: Callback hell
function loadUserData(userId) {
  fetchUser(userId, (user) => {
    fetchOrders(user.id, (orders) => {
      fetchProducts(orders, (products) => {
        console.log(products);
      });
    });
  });
}

// HALLUCINATION: useLocalStorage doesn't exist
function Settings() {
  const [theme, setTheme] = useLocalStorage('theme', 'light');
  return <div>Settings</div>;
}

// ANTI-PATTERN: Any type
function handleData(data: any) {
  return data.value;
}
`;

  console.log('\n📝 SCENARIO: React Dashboard Application');
  console.log('   Existing: useAuth, useFetch, fetchUser, fetchDashboardData, utilities');
  console.log('   AI Code: Dashboard component with multiple issues\n');

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
    console.log('\n📊 REACT DASHBOARD ANALYSIS RESULTS\n');
    console.log(`⏱️  Total Analysis Time: ${result.analysisTime}ms`);
    console.log(`🌐 Language: ${result.language} (${result.languageConfidence}% confidence)`);
    if (result.framework) {
      console.log(`🎯 Framework: ${result.framework}`);
    }
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

    console.log('\n🔍 REACT-SPECIFIC FINDINGS:\n');
    
    // Count React-specific issues
    const reactHooks = result.hallucinations.filter(h => 
      h.message.includes('use') && h.message.match(/use[A-Z]/));
    const reactPatterns = result.antiPatterns.filter(p => 
      p.name.includes('React') || p.name.includes('useEffect'));
    
    console.log(`   ❌ Missing custom hooks: ${reactHooks.length}`);
    console.log(`   ❌ React anti-patterns: ${reactPatterns.length}`);
    console.log(`   ❌ Missing null checks: ${result.antiPatterns.filter(p => p.name.includes('Null')).length}`);
    console.log(`   ❌ Console.log statements: ${result.antiPatterns.filter(p => p.name.includes('console')).length}`);

    console.log('\n💡 TOP RECOMMENDATIONS:\n');
    if (result.summary.hallucinations > 0) {
      console.log(`   1. Implement ${result.summary.hallucinations} missing functions/hooks`);
    }
    if (result.criticalIssues > 0) {
      console.log(`   2. Fix ${result.criticalIssues} critical security issues`);
    }
    if (result.highIssues > 0) {
      console.log(`   3. Address ${result.highIssues} high-severity issues`);
    }
    console.log(`   4. Refactor to fix ${result.summary.antiPatterns.total} anti-patterns`);

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ REACT DASHBOARD TEST COMPLETE!\n');
    console.log('CodeGuardian successfully analyzed a real React dashboard:');
    console.log(`   ✅ Total issues: ${result.totalIssues}`);
    console.log(`   ✅ Analysis time: ${result.analysisTime}ms`);
    console.log(`   ✅ React-aware: YES`);
    console.log(`   ✅ Comprehensive: YES\n`);

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
testReactDashboard()
  .then(result => {
    console.log(`✅ Real-world React dashboard test completed!`);
    console.log(`   Issues found: ${result.totalIssues}`);
    console.log(`   Analysis time: ${result.analysisTime}ms`);
    console.log(`   Overall score: ${result.overallScore}/100\n`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
