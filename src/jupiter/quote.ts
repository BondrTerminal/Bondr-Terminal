import { z } from 'zod';

const quoteResponseSchema = z.object({
  inputMint: z.string(),
  inAmount: z.string(),
  outputMint: z.string(),
  outAmount: z.string(),
  otherAmountThreshold: z.string().optional(),
  swapMode: z.string(),
  slippageBps: z.number().optional(),
  priceImpactPct: z.string().optional(),
  routePlan: z.array(z.unknown()).optional()
}).passthrough();

export type JupiterQuote = z.infer<typeof quoteResponseSchema>;

export async function getJupiterQuote(args: {
  inputMint: string;
  outputMint: string;
  amountAtomic: bigint;
  slippageBps: number;
  quoteUrl?: string;
  apiKey?: string;
}): Promise<JupiterQuote> {
  const url = new URL(args.quoteUrl ?? process.env.JUPITER_QUOTE_URL ?? 'https://api.jup.ag/swap/v1/quote');
  url.searchParams.set('inputMint', args.inputMint);
  url.searchParams.set('outputMint', args.outputMint);
  url.searchParams.set('amount', args.amountAtomic.toString());
  url.searchParams.set('slippageBps', String(args.slippageBps));
  url.searchParams.set('restrictIntermediateTokens', 'true');
  url.searchParams.set('instructionVersion', 'V2');

  const headers = new Headers();
  const apiKey = args.apiKey ?? process.env.JUPITER_API_KEY;
  if (apiKey) headers.set('x-api-key', apiKey);

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Jupiter quote failed ${response.status}: ${await response.text()}`);
  }

  return quoteResponseSchema.parse(await response.json());
}

export function estimatePriceImpactBps(quote: JupiterQuote): number | null {
  if (quote.priceImpactPct === undefined) return null;
  const pct = Number(quote.priceImpactPct);
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 10_000);
}
