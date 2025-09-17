async function testWebhookSystem() {
  try {
    console.log('=== TESTING WEBHOOK SYSTEM ===');
    console.log('\n1. Checking API Health...');

    const healthRes = await fetch('https://hypeface-production.up.railway.app/health');
    const health = await healthRes.json();
    console.log('   Health:', health);

    console.log('\n2. Sending SELL signal via webhook...');
    const webhookRes = await fetch('https://hypeface-production.up.railway.app/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'sell',
        symbol: 'SOL-PERP',
        price: 235.00,
        strategy: 'pyramid'
      })
    });

    const result = await webhookRes.json();
    console.log('   Response:', result);

    if (result.signalId) {
      console.log('\n3. Checking signal status...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

      const statusRes = await fetch(`https://hypeface-production.up.railway.app/webhooks/status/${result.signalId}`);
      const status = await statusRes.json();
      console.log('   Signal Status:', JSON.stringify(status, null, 2));

      if (status.signal && status.signal.metadata && status.signal.metadata.error) {
        console.log('\n❌ ERROR IN SIGNAL PROCESSING:');
        console.log('   ', status.signal.metadata.error);
      } else if (status.trades && status.trades > 0) {
        console.log('\n✅ TRADE EXECUTED SUCCESSFULLY!');
      } else {
        console.log('\n⚠️  NO TRADES EXECUTED - Check logs for details');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testWebhookSystem();
