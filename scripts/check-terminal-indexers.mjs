#!/usr/bin/env node
const base = process.env.TERMINAL_BASE_URL ?? 'http://localhost:3000';
const mint = process.env.TERMINAL_TEST_MINT ?? 'So11111111111111111111111111111111111111112';

async function json(path, init) {
  const response = await fetch(`${base}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function main() {
  const failures = [];
  const snapshot = await json(`/api/terminal-token-snapshot?mint=${mint}&holderLimit=25&limit=50&smoke=1`);
  assert(snapshot.response.ok, `snapshot returned ${snapshot.response.status}`, failures);
  const canonicalSnapshot = await json(`/api/terminal/snapshot?mint=${mint}&holderLimit=25&limit=50&smoke=1`);
  assert(canonicalSnapshot.response.ok, `canonical terminal snapshot returned ${canonicalSnapshot.response.status}`, failures);
  assert(canonicalSnapshot.payload.contract === 'terminal-snapshot-v1', 'canonical snapshot missing terminal-snapshot-v1 contract', failures);
  assert(Array.isArray(snapshot.payload.holders?.rows), 'snapshot missing holders.rows array', failures);
  assert(Array.isArray(snapshot.payload.trades?.rows), 'snapshot missing trades.rows array', failures);
  assert(Array.isArray(snapshot.payload.trades?.topTraders), 'snapshot missing trades.topTraders array', failures);
  assert(Array.isArray(snapshot.payload.positions?.rows), 'snapshot missing positions.rows array', failures);
  assert(snapshot.payload.bundles && typeof snapshot.payload.bundles === 'object', 'snapshot missing bundles object', failures);
  assert(snapshot.payload.freshWallets && typeof snapshot.payload.freshWallets === 'object', 'snapshot missing freshWallets object', failures);
  assert(snapshot.payload.devTokens && typeof snapshot.payload.devTokens === 'object', 'snapshot missing devTokens object', failures);
  assert(snapshot.payload.sources?.poolAge, 'snapshot missing poolAge source block', failures);
  assert(snapshot.payload.sources?.pumpfun, 'snapshot missing Pump.fun source block', failures);
  assert(snapshot.payload.pumpfun && typeof snapshot.payload.pumpfun === 'object', 'snapshot missing pumpfun block', failures);

  const tokenAccounts = await json(`/api/readers/token-accounts?mint=${mint}&limit=25`);
  assert(tokenAccounts.response.ok, `token-accounts returned ${tokenAccounts.response.status}`, failures);
  assert(Array.isArray(tokenAccounts.payload.holders?.rows), 'token-accounts reader missing holder rows', failures);

  const tradeTape = await json(`/api/readers/trade-tape?mint=${mint}&limit=25`);
  assert(tradeTape.response.ok, `trade-tape returned ${tradeTape.response.status}`, failures);
  assert(Array.isArray(tradeTape.payload.trades), 'trade-tape reader missing trades array', failures);
  assert(tradeTape.payload.sources?.trades, 'trade-tape reader missing source status', failures);

  const poolAge = await json(`/api/readers/pool-age?mint=${mint}`);
  assert(poolAge.response.ok, `pool-age returned ${poolAge.response.status}`, failures);
  assert(poolAge.payload.poolAgeSource, 'pool-age reader missing poolAgeSource', failures);
  assert(poolAge.payload.firstSeenAt, 'pool-age reader missing firstSeenAt/pair age', failures);

  const signatures = await json(`/api/token/signatures?mint=${mint}&limit=10`);
  assert(signatures.response.ok, `token-signatures returned ${signatures.response.status}`, failures);
  assert(Array.isArray(signatures.payload.rows), 'token-signatures missing rows array', failures);
  assert(signatures.payload.contract === 'token-signatures-v1', 'token-signatures missing contract marker', failures);

  const canonicalTrades = await json(`/api/token/trades?mint=${mint}&limit=25`);
  assert(canonicalTrades.response.ok, `token-trades returned ${canonicalTrades.response.status}`, failures);
  assert(canonicalTrades.payload.contract === 'token-trades-v1', 'token-trades missing contract marker', failures);
  assert(Array.isArray(canonicalTrades.payload.trades), 'token-trades missing trades array', failures);

  const stream = await fetch(`${base}/api/terminal/stream?mint=${mint}&holderLimit=10&limit=10&smoke=1`);
  const streamText = await stream.text();
  assert(stream.ok, `terminal stream returned ${stream.status}`, failures);
  assert(streamText.includes('event: snapshot'), 'terminal stream missing snapshot event', failures);
  assert(streamText.includes('terminal-snapshot-v1'), 'terminal stream missing snapshot contract payload', failures);

  const pumpToken = await json(`/api/pumpfun/token?mint=${mint}`);
  assert(pumpToken.response.ok, `pumpfun token returned ${pumpToken.response.status}`, failures);
  assert(pumpToken.payload.source === 'pumpfun', 'pumpfun token missing source marker', failures);

  const pumpTrades = await json(`/api/pumpfun/trades?mint=${mint}&limit=10`);
  assert(pumpTrades.response.ok, `pumpfun trades returned ${pumpTrades.response.status}`, failures);
  assert(Array.isArray(pumpTrades.payload.trades), 'pumpfun trades missing trades array', failures);

  const pumpMigrations = await json('/api/pumpfun/migrations?limit=10');
  assert(pumpMigrations.response.ok, `pumpfun migrations returned ${pumpMigrations.response.status}`, failures);
  assert(Array.isArray(pumpMigrations.payload.migrations), 'pumpfun migrations missing migrations array', failures);

  const health = await json('/api/indexer-health');
  assert(health.response.ok, `indexer-health returned ${health.response.status}`, failures);
  assert(health.payload.sources?.helius, 'indexer-health missing Helius status', failures);
  assert(health.payload.sources?.bitquery, 'indexer-health missing Bitquery status', failures);

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('terminal indexer contract check ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
