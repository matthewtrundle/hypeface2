const { HyperliquidClient } = require('./src/services/hyperliquid-client');

async function checkBalance() {
  try {
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    const isTestnet = process.env.HYPERLIQUID_API_URL?.includes('testnet');

    console.log('Checking wallet on:', isTestnet ? 'TESTNET' : 'MAINNET');
    console.log('API URL:', process.env.HYPERLIQUID_API_URL);

    const client = new HyperliquidClient({
      privateKey,
      isTestnet
    });

    await client.initialize();

    console.log('Wallet address:', client.getAddress());

    const balance = await client.getAccountValue();
    console.log('Account value:', balance);

    const positions = await client.getPositions();
    console.log('Open positions:', positions.length);
    if (positions.length > 0) {
      positions.forEach(pos => {
        console.log(`  ${pos.coin}: ${pos.szi} @ ${pos.entryPx}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkBalance();