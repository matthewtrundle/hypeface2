// Direct webhook testing with proper payload
require('dotenv').config();

const WEBHOOK_URL = 'https://hypeface-production.up.railway.app/webhooks/tradingview';
const SECRET = '3e8e55210be930325825be0b2b204f43f558baec';

async function sendTestSignal(action, notes = '') {
  const payload = {
    action: action,
    symbol: 'SOL-PERP',
    price: action === 'buy' ? 140.50 : 141.50,
    strategy: `test-pyramid-${action}`,
    timestamp: Date.now(),
    metadata: {
      test: true,
      notes: notes || `Test ${action} signal`,
      userId: 'test-user' // Try providing userId in metadata
    }
  };

  console.log(`\n🚀 Sending ${action.toUpperCase()} signal...`);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(`${WEBHOOK_URL}?secret=${SECRET}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  const result = await response.text();
  console.log(`Status: ${response.status}`);
  console.log('Response:', result);

  return { status: response.status, body: result };
}

async function runTests() {
  console.log('=== PYRAMID TRADING BOT TEST SUITE ===');
  console.log(`Bot URL: ${WEBHOOK_URL}`);
  console.log(`Secret: ${SECRET.substring(0, 8)}...`);
  console.log();

  try {
    // Test 1: Single BUY signal (Level 1)
    console.log('📊 TEST 1: First BUY signal (Pyramid Level 1)');
    const buy1 = await sendTestSignal('buy', 'First pyramid entry - expect 15% @ 4x leverage');

    if (buy1.status === 200) {
      console.log('✅ BUY signal sent successfully');

      // Wait a bit before next signal
      console.log('⏱️  Waiting 3 seconds before next signal...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Test 2: Second BUY signal (Level 2)
      console.log('\n📊 TEST 2: Second BUY signal (Pyramid Level 2)');
      const buy2 = await sendTestSignal('buy', 'Second pyramid entry - expect 25% @ 6x leverage');

      if (buy2.status === 200) {
        console.log('✅ Second BUY signal sent successfully');

        // Wait before sell
        console.log('⏱️  Waiting 3 seconds before SELL signal...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Test 3: SELL signal (Reduce position)
        console.log('\n📊 TEST 3: SELL signal (Pyramid Exit Level 1)');
        const sell1 = await sendTestSignal('sell', 'First pyramid exit - expect 25% position reduction');

        if (sell1.status === 200) {
          console.log('✅ SELL signal sent successfully');
        } else {
          console.log('❌ SELL signal failed');
        }
      } else {
        console.log('❌ Second BUY signal failed');
      }
    } else {
      console.log('❌ First BUY signal failed');
      console.log('Cannot continue with pyramid tests');
    }

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }

  console.log('\n=== VERIFICATION STEPS ===');
  console.log('1. Check Hyperliquid testnet portfolio:');
  console.log('   https://app.hyperliquid-testnet.xyz/portfolio/0x3D57aF0FeccD210726B5C94E71C6596251EF1339');
  console.log('2. Check Railway logs for processing details');
  console.log('3. Monitor position sizes and pyramid levels');
  console.log('4. Verify leverage and exposure calculations');
}

// Add fetch polyfill if needed
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

runTests().catch(console.error);