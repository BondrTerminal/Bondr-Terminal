import { PublicKey } from '@solana/web3.js';
import type { BundleReceiptRecord } from './jito-relay-adapter';

export type JitoExpectedWalletEffect = {
  wallet: string;
  mint: string;
  txSignature?: string | null;
  preTokenAmountRaw?: string | number | null;
  postTokenAmountRaw?: string | number | null;
  minDeltaRaw?: string | number | null;
  status?: 'confirmed' | 'finalized' | 'failed' | null;
  slot?: number | null;
};

export type JitoBundleChainEffectProof = {
  contract: 'bondr-jito-bundle-chain-effect-proof-v1';
  status: 'verified' | 'blocked';
  bundleId: string | null;
  relayStatus: BundleReceiptRecord['status'] | null;
  txSignatures: string[];
  expectedEffectCount: number;
  verifiedEffectCount: number;
  effects: Array<{
    wallet: string;
    mint: string;
    txSignature: string | null;
    preTokenAmountRaw: string | null;
    postTokenAmountRaw: string | null;
    deltaRaw: string | null;
    slot: number | null;
    status: string | null;
    blockers: string[];
  }>;
  blockers: string[];
  safety: {
    readOnly: true;
    noSigning: true;
    noBroadcast: true;
    noRelaySubmit: true;
    relayReceiptIsNotEnough: true;
  };
};

function validPublicKey(value: string | null | undefined) {
  if (!value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function bigintOrNull(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  try {
    const bigint = BigInt(value);
    return bigint >= 0n ? bigint : null;
  } catch {
    return null;
  }
}

function delta(pre: bigint | null, post: bigint | null) {
  return pre === null || post === null ? null : post - pre;
}

export function buildJitoBundleChainEffectProof(input: {
  receipt?: BundleReceiptRecord | null;
  expectedEffects: JitoExpectedWalletEffect[];
}): JitoBundleChainEffectProof {
  const receipt = input.receipt ?? null;
  const receiptLanded = receipt?.status === 'landed' || receipt?.status === 'finalized';
  const effects = input.expectedEffects.map((effect) => {
    const pre = bigintOrNull(effect.preTokenAmountRaw);
    const post = bigintOrNull(effect.postTokenAmountRaw);
    const minDelta = bigintOrNull(effect.minDeltaRaw ?? 1);
    const observedDelta = delta(pre, post);
    const signature = effect.txSignature ?? null;
    const blockers = [
      validPublicKey(effect.wallet) ? null : `effect-invalid-wallet-${effect.wallet}`,
      validPublicKey(effect.mint) ? null : `effect-invalid-mint-${effect.mint}`,
      signature ? null : `effect-${effect.wallet}-signature-required`,
      signature && receipt?.txSignatures.includes(signature) ? null : `effect-${effect.wallet}-signature-not-in-bundle-receipt`,
      effect.status === 'confirmed' || effect.status === 'finalized' ? null : `effect-${effect.wallet}-chain-status-not-confirmed`,
      Number.isFinite(effect.slot) && Number(effect.slot) > 0 ? null : `effect-${effect.wallet}-slot-required`,
      receipt?.landedSlot && effect.slot && effect.slot < receipt.landedSlot ? `effect-${effect.wallet}-slot-before-bundle-landing` : null,
      pre !== null ? null : `effect-${effect.wallet}-pre-token-amount-required`,
      post !== null ? null : `effect-${effect.wallet}-post-token-amount-required`,
      observedDelta !== null && minDelta !== null && observedDelta >= minDelta ? null : `effect-${effect.wallet}-token-delta-below-minimum`
    ].filter((item): item is string => Boolean(item));
    return {
      wallet: effect.wallet,
      mint: effect.mint,
      txSignature: signature,
      preTokenAmountRaw: pre?.toString() ?? null,
      postTokenAmountRaw: post?.toString() ?? null,
      deltaRaw: observedDelta?.toString() ?? null,
      slot: effect.slot ?? null,
      status: effect.status ?? null,
      blockers: Array.from(new Set(blockers))
    };
  });
  const blockers = Array.from(new Set([
    receipt ? null : 'bundle-receipt-required',
    receiptLanded ? null : 'bundle-receipt-landed-or-finalized-required',
    input.expectedEffects.length ? null : 'expected-wallet-effects-required',
    ...effects.flatMap((effect) => effect.blockers)
  ].filter((item): item is string => Boolean(item))));

  return {
    contract: 'bondr-jito-bundle-chain-effect-proof-v1',
    status: blockers.length ? 'blocked' : 'verified',
    bundleId: receipt?.bundleId ?? null,
    relayStatus: receipt?.status ?? null,
    txSignatures: receipt?.txSignatures ?? [],
    expectedEffectCount: input.expectedEffects.length,
    verifiedEffectCount: effects.filter((effect) => effect.blockers.length === 0).length,
    effects,
    blockers,
    safety: {
      readOnly: true,
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      relayReceiptIsNotEnough: true
    }
  };
}
