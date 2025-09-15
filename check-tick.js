// Quick test to find SOL-PERP tick size
const price1 = 256.75649999999996;
const price2 = 256.5;

// Common tick sizes
const ticks = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1];

console.log('Testing price:', price1);
ticks.forEach(tick => {
  const remainder = price1 % tick;
  if (remainder < 0.0001) {
    console.log(`✓ Divisible by ${tick}`);
  } else {
    console.log(`✗ Not divisible by ${tick} (remainder: ${remainder})`);
  }
});

// The error said "asset=5" which might mean 0.05 tick size
console.log('\nRounding to 0.05 tick size:');
const rounded = Math.round(price1 / 0.05) * 0.05;
console.log('Original:', price1);
console.log('Rounded:', rounded);