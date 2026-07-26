import { createPaperVenueAdapter, type PaperVenueAdapter } from './paper-adapter.js';

export function createPhoenixPaperAdapter(): PaperVenueAdapter {
  return createPaperVenueAdapter('phoenix');
}
