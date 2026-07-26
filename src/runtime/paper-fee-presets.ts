import type { Venue } from '../types/config.js';
import type { PaperQuoteVenue } from './paper-quotes.js';

export type PaperFeePresetName = 'zero' | 'openbook-v2-default' | 'phoenix-default';

export type PaperFeePreset = {
  name: PaperFeePresetName;
  venue: PaperQuoteVenue | 'generic';
  makerFeeBps: number;
  takerFeeBps: number;
  source: 'paper-preset';
  notes: string[];
  liveExecution: false;
  paperOnly: true;
};

export type PaperFeeSelection = PaperFeePreset & {
  requestedVenue: Venue | PaperQuoteVenue | null;
  requestedPreset: PaperFeePresetName | null;
  skippedReasons: string[];
};

export const OPENBOOK_V2_FEES_SCALE_FACTOR = 1_000_000;
export const OPENBOOK_V2_RAW_FEE_UNITS_PER_BPS = 100;

const PRESETS: Record<PaperFeePresetName, PaperFeePreset> = {
  zero: {
    name: 'zero',
    venue: 'generic',
    makerFeeBps: 0,
    takerFeeBps: 0,
    source: 'paper-preset',
    notes: ['Zero-fee deterministic baseline for tests and early paper sessions.'],
    liveExecution: false,
    paperOnly: true
  },
  'openbook-v2-default': {
    name: 'openbook-v2-default',
    venue: 'openbook',
    makerFeeBps: 0,
    takerFeeBps: 0,
    source: 'paper-preset',
    notes: [
      'OpenBook v2 fees are market-specific fields on the Market account, not a global schedule.',
      'Placeholder zero-fee paper assumption until a target market account is decoded.',
      'OpenBook raw fee units convert to bps by dividing by 100; negative maker values represent maker rebates.'
    ],
    liveExecution: false,
    paperOnly: true
  },
  'phoenix-default': {
    name: 'phoenix-default',
    venue: 'generic',
    makerFeeBps: 0,
    takerFeeBps: 0,
    source: 'paper-preset',
    notes: [
      'Placeholder Phoenix paper assumption until Phoenix is added to config venues and a target market fee schedule is selected.',
      'Do not treat as live venue fee truth without market-specific verification.'
    ],
    liveExecution: false,
    paperOnly: true
  }
};

function clonePreset(preset: PaperFeePreset): PaperFeePreset {
  return {
    ...preset,
    notes: [...preset.notes],
    liveExecution: false,
    paperOnly: true
  };
}

export function getPaperFeePreset(name: PaperFeePresetName): PaperFeePreset {
  return clonePreset(PRESETS[name]);
}

export function listPaperFeePresets(): PaperFeePreset[] {
  return (Object.keys(PRESETS) as PaperFeePresetName[]).map(getPaperFeePreset);
}

function presetNameForVenue(venue: Venue | PaperQuoteVenue | null | undefined): PaperFeePresetName {
  if (venue === 'openbook') return 'openbook-v2-default';
  if (venue === 'phoenix') return 'phoenix-default';
  return 'zero';
}

export function openBookV2RawFeeUnitsToBps(rawFeeUnits: number): number {
  if (!Number.isFinite(rawFeeUnits)) {
    throw new Error(`OpenBook v2 raw fee units must be finite; received ${String(rawFeeUnits)}`);
  }
  return rawFeeUnits / OPENBOOK_V2_RAW_FEE_UNITS_PER_BPS;
}

export function selectPaperFeePreset(args: {
  venue?: Venue | PaperQuoteVenue | null;
  presetName?: PaperFeePresetName;
  makerFeeBps?: number;
  takerFeeBps?: number;
}): PaperFeeSelection {
  const skippedReasons: string[] = [];
  const requestedPreset = args.presetName ?? null;
  const requestedVenue = args.venue ?? null;
  const preset = getPaperFeePreset(args.presetName ?? presetNameForVenue(args.venue));
  const makerFeeBps = args.makerFeeBps ?? preset.makerFeeBps;
  const takerFeeBps = args.takerFeeBps ?? preset.takerFeeBps;

  if (!Number.isFinite(makerFeeBps)) {
    throw new Error(`paper makerFeeBps must be a finite number; received ${String(makerFeeBps)}`);
  }
  if (!Number.isFinite(takerFeeBps) || takerFeeBps < 0) {
    throw new Error(`paper takerFeeBps must be a non-negative finite number; received ${String(takerFeeBps)}`);
  }

  if (args.makerFeeBps !== undefined || args.takerFeeBps !== undefined) {
    skippedReasons.push('paper fee preset values overridden by explicit paper fee bps');
  }
  if (requestedVenue !== null && preset.venue !== 'generic' && preset.venue !== requestedVenue) {
    skippedReasons.push(`paper fee preset ${preset.name} does not match requested venue ${requestedVenue}`);
  }

  return {
    ...preset,
    makerFeeBps,
    takerFeeBps,
    requestedVenue,
    requestedPreset,
    skippedReasons,
    notes: [...preset.notes],
    source: 'paper-preset',
    liveExecution: false,
    paperOnly: true
  };
}
