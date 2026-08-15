import { Keypair } from '@solana/web3.js';

const endpoint = process.env.PUMPPORTAL_TRADE_LOCAL_URL || 'https://pumpportal.fun/api/trade-local';
const publicKey = process.env.PUMPPORTAL_DEBUG_PUBLIC_KEY || '8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz';
const metadataUri = process.env.PUMPPORTAL_DEBUG_METADATA_URI || 'https://gateway.pinata.cloud/ipfs/bafkreieaynaewphfo7zspu6iorxqwayjwhk7ehrkn45qihydsajxm7u3xa';
const tokenName = process.env.PUMPPORTAL_DEBUG_TOKEN_NAME || 'TEST';
const tokenSymbol = process.env.PUMPPORTAL_DEBUG_TOKEN_SYMBOL || 'TEST';

function mintPublicKey() {
  return Keypair.generate().publicKey.toBase58();
}

async function grindPumpSuffix(maxAttempts = 250_000) {
  const started = Date.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const key = mintPublicKey();
    if (key.endsWith('pump')) return { key, attempts: attempt, elapsedMs: Date.now() - started, found: true };
    if (attempt % 25_000 === 0) await new Promise((resolve) => setImmediate(resolve));
  }
  return { key: null, attempts: maxAttempts, elapsedMs: Date.now() - started, found: false };
}

function baseBody(overrides = {}) {
  return {
    publicKey,
    action: 'create',
    tokenMetadata: {
      name: tokenName,
      symbol: tokenSymbol,
      uri: metadataUri
    },
    mint: mintPublicKey(),
    denominatedInSol: 'true',
    amount: 0.0001,
    slippage: 10,
    priorityFee: 0.0001,
    pool: 'pump',
    ...overrides
  };
}

async function callVariant(label, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const bodyPreview = contentType.includes('text') || contentType.includes('json')
    ? bytes.subarray(0, 200).toString('utf8')
    : bytes.subarray(0, 24).toString('hex');

  return {
    label,
    status: response.status,
    statusText: response.statusText,
    contentType,
    byteLength: bytes.length,
    bodyPreview,
    request: {
      action: body.action,
      publicKey: body.publicKey,
      mint: body.mint,
      mintEndsWithPump: typeof body.mint === 'string' ? body.mint.endsWith('pump') : false,
      metadataUri: body.tokenMetadata?.uri ?? null,
      amount: body.amount,
      slippage: body.slippage,
      priorityFee: body.priorityFee,
      pool: body.pool ?? null,
      denominatedInSol: body.denominatedInSol
    }
  };
}

async function main() {
  const variants = [
    ['bondr-current-shape', baseBody({ amount: 0.01, slippage: 1, priorityFee: 0.00001 })],
    ['docs-small-buy', baseBody()],
    ['ipfs-io-metadata', baseBody({ tokenMetadata: { name: tokenName, symbol: tokenSymbol, uri: metadataUri.replace('https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/') } })],
    ['ipfs-uri-metadata', baseBody({ tokenMetadata: { name: tokenName, symbol: tokenSymbol, uri: metadataUri.replace('https://gateway.pinata.cloud/ipfs/', 'ipfs://') } })],
    ['pool-auto', baseBody({ pool: 'auto' })],
    ['pool-omitted', (() => { const body = baseBody(); delete body.pool; return body; })()],
    ['slippage-30', baseBody({ slippage: 30 })],
    ['priority-0-00001', baseBody({ priorityFee: 0.00001 })],
    ['buy-0-001', baseBody({ amount: 0.001 })],
    ['buy-0-01', baseBody({ amount: 0.01 })]
  ];

  const grind = await grindPumpSuffix(Number(process.env.PUMPPORTAL_DEBUG_PUMP_SUFFIX_ATTEMPTS || '250000'));
  if (grind.found) {
    variants.push(['mint-suffix-pump', baseBody({ mint: grind.key })]);
  } else {
    console.log(JSON.stringify({ label: 'mint-suffix-pump-skip', found: false, attempts: grind.attempts, elapsedMs: grind.elapsedMs }));
  }

  for (const [label, body] of variants) {
    try {
      console.log(JSON.stringify(await callVariant(label, body)));
    } catch (error) {
      console.log(JSON.stringify({ label, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
