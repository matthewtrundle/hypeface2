const axios = require('axios');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3001';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test-secret';

async function testBuySignal() {
  const payload = {
    action: 'buy',
    symbol: 'SOL-PERP',
    price: 250.00,
    strategy: 'pyramid',
    leverage: 5,
    metadata: {
      test: true,
      timestamp: Date.now()
    }
  };

  console.log('Testing BUY signal for SOL-PERP...');
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${API_URL}/webhooks/tradingview`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': WEBHOOK_SECRET,
          'X-Webhook-Timestamp': Date.now().toString()
        }
      }
    );

    console.log('✅ Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data?.details) {
      console.error('Details:', JSON.stringify(error.response.data.details, null, 2));
    }
    throw error;
  }
}

// Run test
testBuySignal()
  .then(result => {
    console.log('Test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed!');
    process.exit(1);
  });