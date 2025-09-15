const { Hyperliquid } = require('hyperliquid');

async function checkMeta() {
  try {
    const client = new Hyperliquid({
      privateKey: 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156',
      testnet: false
    });

    // Get metadata for all assets
    const meta = await client.info.generalAPI.getMeta();

    // Find SOL-PERP
    const solMeta = meta.universe.find(asset => asset.name === 'SOL-PERP');

    if (solMeta) {
      console.log('SOL-PERP Metadata:');
      console.log('- Min Size:', solMeta.szDecimals);
      console.log('- Full metadata:', JSON.stringify(solMeta, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkMeta();