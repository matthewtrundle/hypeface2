#!/usr/bin/env node

const { Wallet } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

// Generate a new random wallet
const wallet = Wallet.createRandom();

// Generate a master encryption key if not provided
const masterKey = process.env.MASTER_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// Encrypt the private key
const encryptedPrivateKey = CryptoJS.AES.encrypt(wallet.privateKey, masterKey).toString();

console.log('\n=================================');
console.log('🔐 TEST WALLET GENERATED');
console.log('=================================\n');
console.log('⚠️  WARNING: This is for TESTING only!');
console.log('⚠️  Generate a new wallet for production!\n');
console.log('=================================\n');

console.log('Public Address:', wallet.address);
console.log('Private Key (RAW - KEEP SECRET):', wallet.privateKey);
console.log('\n=================================\n');

console.log('Add these to your .env file:\n');
console.log(`WALLET_PUBLIC_KEY="${wallet.address}"`);
console.log(`WALLET_PRIVATE_KEY="${encryptedPrivateKey}"`);
console.log(`MASTER_ENCRYPTION_KEY="${masterKey}"`);

console.log('\n=================================\n');
console.log('Mnemonic Phrase (KEEP SAFE):');
console.log(wallet.mnemonic.phrase);
console.log('\n=================================\n');

// Create a test wallet info file (gitignored)
const walletInfo = {
  address: wallet.address,
  encryptedPrivateKey: encryptedPrivateKey,
  masterKey: masterKey,
  createdAt: new Date().toISOString(),
  warning: 'TEST WALLET ONLY - DO NOT USE FOR PRODUCTION',
};

const walletDir = path.join(__dirname, '..', 'wallets');
if (!fs.existsSync(walletDir)) {
  fs.mkdirSync(walletDir, { recursive: true });
}

const walletFile = path.join(walletDir, 'test-wallet.json');
fs.writeFileSync(walletFile, JSON.stringify(walletInfo, null, 2));

console.log(`Wallet info saved to: ${walletFile}`);
console.log('(This file is gitignored)\n');

console.log('Next steps:');
console.log('1. Copy the environment variables to your .env file');
console.log('2. For testnet: Get test funds from https://app.hyperliquid-testnet.xyz/drip');
console.log('3. For mainnet: Create a NEW wallet and transfer funds carefully\n');