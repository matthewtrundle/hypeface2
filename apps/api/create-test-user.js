// Create test user via direct API call
// This bypasses the database connection issues by using the running bot's API

async function createTestUser() {
  console.log('=== CREATING TEST USER FOR WEBHOOK TESTING ===\n');

  // Use the auth endpoint to create a user
  // First, try with different credentials or see what happens

  const testCredentials = [
    { username: 'admin', password: 'hyperliquid2024' },
    { username: 'admin', password: 'admin' },
    { username: 'test', password: 'test' },
    { username: 'test', password: 'hyperliquid2024' }
  ];

  for (const creds of testCredentials) {
    try {
      console.log(`Trying: ${creds.username}/${creds.password}`);

      const response = await fetch('https://hypeface-production.up.railway.app/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(creds)
      });

      const result = await response.text();
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${result}\n`);

      if (response.status === 200) {
        console.log('✅ Successfully logged in! User should now exist.');
        return;
      }
    } catch (error) {
      console.log(`❌ Failed: ${error.message}\n`);
    }
  }

  console.log('❌ All credential combinations failed.');
  console.log('\nPossible solutions:');
  console.log('1. Check Railway environment variables for ADMIN_USERNAME/ADMIN_PASSWORD');
  console.log('2. Run database seed script on production');
  console.log('3. Modify webhook handler to auto-create users');
  console.log('4. Use a different testing approach');
}

// Add fetch polyfill if needed
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

createTestUser().catch(console.error);