import {
  cancelOrder,
  markPlaced,
  type PaperOrder
} from '../execution/order-lifecycle.js';
import type { VenueAdapter, VenueHealth, VenueName } from './types.js';

export type PaperVenueAdapter = Omit<VenueAdapter, 'placeOrder' | 'cancelOrder'> & {
  paperOnly: true;
  placePaperOrder(order: PaperOrder): Promise<PaperOrder>;
  cancelPaperOrder(orderId: string, reason?: string): Promise<PaperOrder>;
  getPaperOrder(orderId: string): PaperOrder | null;
  listPaperOrders(): PaperOrder[];
  placeOrder(order: PaperOrder): Promise<never>;
  cancelOrder(orderId: string): Promise<never>;
};

export function createPaperVenueAdapter(name: Extract<VenueName, 'phoenix' | 'openbook'>): PaperVenueAdapter {
  const orders = new Map<string, PaperOrder>();

  return {
    name,
    paperOnly: true,
    async health(): Promise<VenueHealth> {
      return {
        venue: name,
        ok: true,
        observedAt: new Date().toISOString(),
        latencyMs: 0,
        reason: `${name} paper adapter only; no SDK, network, signing, or live placement`
      };
    },
    async placePaperOrder(order: PaperOrder): Promise<PaperOrder> {
      if (orders.has(order.id)) throw new Error(`paper order ${order.id} already exists`);
      const placed = markPlaced(order);
      orders.set(placed.id, placed);
      return placed;
    },
    async cancelPaperOrder(orderId: string, reason = 'paper cancel requested'): Promise<PaperOrder> {
      const existing = orders.get(orderId);
      if (existing === undefined) throw new Error(`paper order ${orderId} not found`);
      const cancelled = cancelOrder({ order: existing, reason });
      orders.set(orderId, cancelled);
      return cancelled;
    },
    getPaperOrder(orderId: string): PaperOrder | null {
      return orders.get(orderId) ?? null;
    },
    listPaperOrders(): PaperOrder[] {
      return Array.from(orders.values());
    },
    async placeOrder(): Promise<never> {
      throw new Error(`${name} live placeOrder is disabled; use placePaperOrder for paper simulation`);
    },
    async cancelOrder(): Promise<never> {
      throw new Error(`${name} live cancelOrder is disabled; use cancelPaperOrder for paper simulation`);
    }
  };
}
