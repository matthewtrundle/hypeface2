const { Hyperliquid } = require('hyperliquid');

async function checkLeverageAPI() {
  try {
    // Create a minimal instance just to inspect methods
    const client = new Hyperliquid({
      privateKey: '0x' + '0'.repeat(64), // Dummy key just to inspect API
      testnet: true
    });

    console.log('\n=== Checking Hyperliquid Exchange Methods ===\n');

    // Check what methods are available on exchange
    const exchangeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.exchange));
    console.log('Exchange methods:', exchangeMethods.filter(m => m.toLowerCase().includes('lever')));

    // Check the actual method signature
    if (client.exchange.updateLeverage) {
      console.log('\nupdateLeverage exists:', typeof client.exchange.updateLeverage);
      console.log('updateLeverage:', client.exchange.updateLeverage.toString().substring(0, 200));
    }

    // Check for other leverage-related methods
    exchangeMethods.forEach(method => {
      if (method.toLowerCase().includes('lever') || method.toLowerCase().includes('margin')) {
        console.log(`\nMethod: ${method}`);
      }
    });

    // Also check what's on the main client
    const clientMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client));
    console.log('\n\nClient level methods with leverage:', clientMethods.filter(m => m.toLowerCase().includes('lever')));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkLeverageAPI();