const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function checkFills() {
  const wallet = new ethers.Wallet('a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156');
  const client = new Hyperliquid({ privateKey: wallet.privateKey, testnet: false });

  const fills = await client.info.generalAPI.getUserFills(wallet.address);

  console.log('Recent fills (last 10):');
  fills.slice(0, 10).forEach(fill => {
    const time = new Date(fill.time).toLocaleString();
    console.log(`${time}: ${fill.side} ${fill.sz} ${fill.coin} @ ${fill.px}`);
  });

  process.exit(0);
}

checkFills().catch(console.error);