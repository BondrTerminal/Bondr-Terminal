import { createPaperVenueAdapter, type PaperVenueAdapter } from './paper-adapter.js';

export function createOpenBookPaperAdapter(): PaperVenueAdapter {
  return createPaperVenueAdapter('openbook');
}
