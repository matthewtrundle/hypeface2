const fs = require('fs');

const csvData = fs.readFileSync('/Users/mattrundle/Downloads/TradingView_Alerts_Log_2025-10-02_15ebb.csv', 'utf8');
const lines = csvData.split('\n');

const perpSignals = [];

for (const line of lines) {
  if (line.includes('PERP')) {
    const match = line.match(/"symbol":\s*"([^"]+PERP)"/);
    const timeMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
    const actionMatch = line.match(/"action":\s*"(buy|sell)"/i);

    if (match && timeMatch && actionMatch) {
      perpSignals.push({
        symbol: match[1],
        action: actionMatch[1].toUpperCase(),
        time: timeMatch[1]
      });
    }
  }
}

// Sort by time descending
perpSignals.sort((a, b) => new Date(b.time) - new Date(a.time));

console.log('\n🎯 PERP SIGNALS (Most Recent First)\n');
console.log('Time (UTC)           Symbol            Action');
console.log('='.repeat(60));

perpSignals.slice(0, 30).forEach(sig => {
  const time = sig.time.replace('T', ' ').replace('Z', '');
  console.log(`${time}   ${sig.symbol.padEnd(15)} ${sig.action}`);
});

// Analyze spacing
console.log('\n📊 SIGNAL ANALYSIS\n');

const solSignals = perpSignals.filter(s => s.symbol === 'SOL-PERP');
const fartSignals = perpSignals.filter(s => s.symbol === 'FARTCOIN-PERP');

console.log(`Total PERP signals: ${perpSignals.length}`);
console.log(`SOL-PERP signals: ${solSignals.length}`);
console.log(`FARTCOIN-PERP signals: ${fartSignals.length}`);

// Check for rapid-fire signals
console.log('\n⚠️  RAPID SIGNALS (< 30 min apart):\n');

for (let i = 0; i < perpSignals.length - 1; i++) {
  const curr = perpSignals[i];
  const next = perpSignals[i + 1];

  if (curr.symbol === next.symbol) {
    const diffMs = new Date(curr.time) - new Date(next.time);
    const diffMin = Math.floor(diffMs / 1000 / 60);

    if (diffMin < 30 && diffMin > 0) {
      console.log(`${curr.symbol}: ${curr.action} @ ${curr.time.split('T')[1].replace('Z', '')} → ${next.action} @ ${next.time.split('T')[1].replace('Z', '')} (${diffMin} min apart)`);
    }
  }
}
