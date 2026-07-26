import type { OrderbookSnapshot, VenueAdapter, VenueHealth, VenueName } from './types.js';

export function createDisabledOrderbookAdapter(name: Exclude<VenueName, 'jupiter'>): VenueAdapter {
  return {
    name,
    async health(): Promise<VenueHealth> {
      return {
        venue: name,
        ok: false,
        observedAt: new Date().toISOString(),
        latencyMs: null,
        reason: `${name} adapter is not implemented in foundation v0`
      };
    },
    async getOrderbook(_market: string): Promise<OrderbookSnapshot> {
      throw new Error(`${name} orderbook adapter is not implemented in foundation v0`);
    },
    async placeOrder(): Promise<never> {
      throw new Error(`${name} live order placement is disabled in foundation v0`);
    },
    async cancelOrder(): Promise<never> {
      throw new Error(`${name} live order cancellation is disabled in foundation v0`);
    }
  };
}
