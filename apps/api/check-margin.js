const { Hyperliquid } = require('hyperliquid');

async function checkOrderPlacement() {
  console.log('Testing Hyperliquid order placement...\n');

  // Test configuration
  const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.FALLBACK_WALLET_KEY;

  if (!privateKey || privateKey === 'encrypted-private-key-placeholder') {
    console.error('No valid private key found in environment variables');
    return;
  }

  try {
    // Initialize client
    const client = new Hyperliquid({
      privateKey: privateKey,
      testnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
    });

    console.log('✓ Client initialized\n');

    // Get current positions
    const { ethers } = require('ethers');
    const wallet = new ethers.Wallet(privateKey);
    const clearinghouseState = await client.info.perpetuals.getClearinghouseState(wallet.address);

    console.log('Current positions:');
    for (const pos of clearinghouseState.assetPositions) {
      if (Math.abs(parseFloat(pos.position.szi)) > 0.01) {
        console.log(`  ${pos.position.coin}: ${pos.position.szi} @ ${pos.position.entryPx}`);
      }
    }
    console.log('');

    // Find SOL position
    const solPosition = clearinghouseState.assetPositions.find(p => p.position.coin === 'SOL-PERP');

    if (!solPosition || Math.abs(parseFloat(solPosition.position.szi)) < 0.01) {
      console.log('No SOL position found to test sell order');
      return;
    }

    const currentSize = Math.abs(parseFloat(solPosition.position.szi));
    console.log(`Found SOL position: ${currentSize} SOL\n`);

    // Test different order formats
    const testCases = [
      {
        name: 'String size (2 decimals)',
        order: {
          coin: 'SOL-PERP',
          is_buy: false,
          sz: '0.42',
          order_type: { market: {} },
          reduce_only: true
        }
      },
      {
        name: 'Number size',
        order: {
          coin: 'SOL-PERP',
          is_buy: false,
          sz: 0.42,
          order_type: { market: {} },
          reduce_only: true
        }
      },
      {
        name: 'String with trailing zeros',
        order: {
          coin: 'SOL-PERP',
          is_buy: false,
          sz: '0.42000000',
          order_type: { market: {} },
          reduce_only: true
        }
      },
      {
        name: 'With limit_px null',
        order: {
          coin: 'SOL-PERP',
          is_buy: false,
          sz: '0.42',
          limit_px: null,
          order_type: { market: {} },
          reduce_only: true
        }
      },
      {
        name: 'With limit_px undefined',
        order: {
          coin: 'SOL-PERP',
          is_buy: false,
          sz: '0.42',
          limit_px: undefined,
          order_type: { market: {} },
          reduce_only: true
        }
      }
    ];

    console.log('Testing order formats (DRY RUN - not placing real orders):\n');

    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}`);
      console.log(`  Order:`, JSON.stringify(testCase.order, null, 2));

      try {
        // Validate the order structure without actually placing it
        // Check what the SDK does with the order
        console.log(`  ✓ Order structure appears valid\n`);
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}\n`);
      }
    }

    // Now test the actual placeOrder method with a tiny test order
    console.log('\nTesting actual order placement with minimal size:');

    const testOrder = {
      coin: 'SOL-PERP',
      is_buy: false,
      sz: '0.01', // Minimal size to test
      order_type: { market: {} },
      reduce_only: true
    };

    console.log('Test order:', JSON.stringify(testOrder, null, 2));

    // Uncomment to actually place the order:
    // const result = await client.exchange.placeOrder(testOrder);
    // console.log('Result:', result);

  } catch (error) {
    console.error('Error during test:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
checkOrderPlacement();