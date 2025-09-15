const { ethers } = require('ethers');

// Generate a new random wallet
const wallet = ethers.Wallet.createRandom();

console.log('🔑 New Hyperliquid Wallet Generated:\n');
console.log('Address (Public Key):', wallet.address);
console.log('Private Key:', wallet.privateKey);
console.log('\n⚠️  IMPORTANT:');
console.log('1. Save your private key securely - you cannot recover it if lost!');
console.log('2. Never share your private key with anyone');
console.log('3. Use the private key (without 0x prefix) in your .env file');
console.log('\nFor Railway, use just the hex part:');
console.log(wallet.privateKey.slice(2)); // Remove 0x prefix
console.log('\n💰 Fund this wallet:');
console.log('1. Send USDC to this address on Arbitrum network');
console.log('2. Bridge to Hyperliquid at https://app.hyperliquid.xyz/bridge');