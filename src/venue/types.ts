import type { PaperOrder } from '../execution/order-lifecycle.js';

export type VenueName = 'jupiter' | 'phoenix' | 'openbook' | 'raydium' | 'orca' | 'meteora';

export type VenueHealth = {
  venue: VenueName;
  ok: boolean;
  observedAt: string;
  latencyMs: number | null;
  reason?: string;
};

export type OrderbookLevel = {
  price: number;
  sizeUi: number;
};

export type OrderbookSnapshot = {
  venue: VenueName;
  market: string;
  observedAt: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
};

export type VenueAdapter = {
  name: VenueName;
  health(): Promise<VenueHealth>;
  getOrderbook?(market: string): Promise<OrderbookSnapshot>;
  placeOrder?(order: PaperOrder): Promise<never>;
  cancelOrder?(orderId: string): Promise<never>;
};

export function bestBidAsk(snapshot: OrderbookSnapshot): { bestBid: number | null; bestAsk: number | null; mid: number | null } {
  const bestBid = snapshot.bids.length > 0 ? Math.max(...snapshot.bids.map((level) => level.price)) : null;
  const bestAsk = snapshot.asks.length > 0 ? Math.min(...snapshot.asks.map((level) => level.price)) : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  return { bestBid, bestAsk, mid };
}
