#!/usr/bin/env node

/**
 * API Test Script for Hyperliquid Trading Bot
 * Tests all major API endpoints
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'testpassword';

let authToken = null;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

async function testHealth() {
  console.log('\n📍 Testing Health Endpoint...');
  try {
    const response = await api.get('/health');
    console.log('✅ Health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testAuth() {
  console.log('\n🔐 Testing Authentication...');

  // Test registration
  console.log('Testing registration...');
  try {
    const registerResponse = await api.post('/auth/register', {
      email: `test-${Date.now()}@example.com`,
      password: 'testpassword123',
    });
    console.log('✅ Registration successful');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️  User already exists (expected)');
    } else {
      console.error('❌ Registration failed:', error.response?.data || error.message);
    }
  }

  // Test login
  console.log('Testing login...');
  try {
    const loginResponse = await api.post('/auth/login', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    authToken = loginResponse.data.token;
    console.log('✅ Login successful, token received');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

async function testDashboard() {
  console.log('\n📊 Testing Dashboard Endpoints...');

  if (!authToken) {
    console.log('⚠️  Skipping dashboard tests (not authenticated)');
    return false;
  }

  // Test dashboard data
  console.log('Testing dashboard data...');
  try {
    const response = await api.get('/api/dashboard');
    console.log('✅ Dashboard data retrieved');
    console.log('   - Positions:', response.data.positions?.length || 0);
    console.log('   - Trades:', response.data.trades?.length || 0);
    console.log('   - Balance:', response.data.balance?.total || 0);
  } catch (error) {
    console.error('❌ Dashboard request failed:', error.response?.data || error.message);
    return false;
  }

  // Test positions
  console.log('Testing positions endpoint...');
  try {
    const response = await api.get('/api/positions');
    console.log('✅ Positions retrieved:', response.data.positions?.length || 0);
  } catch (error) {
    console.error('❌ Positions request failed:', error.response?.data || error.message);
  }

  // Test trades
  console.log('Testing trades endpoint...');
  try {
    const response = await api.get('/api/trades');
    console.log('✅ Trades retrieved:', response.data.trades?.length || 0);
  } catch (error) {
    console.error('❌ Trades request failed:', error.response?.data || error.message);
  }

  // Test system status
  console.log('Testing system status...');
  try {
    const response = await api.get('/api/system/status');
    console.log('✅ System status:', response.data.status);
  } catch (error) {
    console.error('❌ System status request failed:', error.response?.data || error.message);
  }

  return true;
}

async function testWebhook() {
  console.log('\n🪝 Testing Webhook Endpoint...');

  const payload = {
    action: 'buy',
    symbol: 'ETH-USD',
    strategy: 'api-test',
    metadata: {
      test: true,
    },
  };

  console.log('Sending test webhook (buy signal)...');
  try {
    const response = await api.post('/webhooks/test', payload);
    console.log('✅ Webhook accepted:', response.data);

    if (response.data.signalId) {
      // Check signal status
      console.log('Checking signal status...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await api.get(`/webhooks/status/${response.data.signalId}`);
      console.log('✅ Signal status:', statusResponse.data.signal?.status);
    }

    return true;
  } catch (error) {
    console.error('❌ Webhook test failed:', error.response?.data || error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Hyperliquid Trading Bot API Tests');
  console.log('API URL:', API_URL);
  console.log('=' .repeat(50));

  const results = {
    health: await testHealth(),
    auth: await testAuth(),
    dashboard: await testDashboard(),
    webhook: await testWebhook(),
  };

  console.log('\n' + '=' .repeat(50));
  console.log('📋 Test Results Summary:');
  console.log('- Health Check:', results.health ? '✅' : '❌');
  console.log('- Authentication:', results.auth ? '✅' : '❌');
  console.log('- Dashboard:', results.dashboard ? '✅' : '❌');
  console.log('- Webhooks:', results.webhook ? '✅' : '❌');

  const allPassed = Object.values(results).every(r => r);
  console.log('\nOverall:', allPassed ? '✅ All tests passed!' : '❌ Some tests failed');

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(console.error);