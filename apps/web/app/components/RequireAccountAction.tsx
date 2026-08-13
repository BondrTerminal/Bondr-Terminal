'use client';

import { useState, type ReactNode } from 'react';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';

export function useRequireTurnkeyAccount() {
  const account = useBondrTurnkeyAccount();
  const [promptOpen, setPromptOpen] = useState(false);

  async function requireAccount(onReady?: () => void | Promise<void>) {
    if (account.authenticated) {
      await onReady?.();
      return true;
    }
    setPromptOpen(true);
    return false;
  }

  return { account, promptOpen, setPromptOpen, requireAccount };
}

export function AccountGatePrompt({ open, onClose, intent = 'Continue', children }: { open: boolean; onClose: () => void; intent?: string; children?: ReactNode }) {
  const account = useBondrTurnkeyAccount();
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function login() {
    if (!account.configured || !account.clientReady) return;
    setBusy(true);
    try {
      await account.login();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="accountGateBackdrop" role="dialog" aria-modal="true" aria-label="Turnkey account required">
      <div className="accountGateCard">
        <div className="accountGateGlow" />
        <div className="profileAvatar accountGateAvatar">TK</div>
        <div className="eyebrow">Account gate</div>
        <h2>Log in to {intent}</h2>
        <p>{children ?? 'This workflow needs a Turnkey operator identity. Signing still happens through your browser wallet and remains simulation-gated.'}</p>
        <div className="accountGateChecklist">
          <span>Identity only</span>
          <span>Browser-wallet signer</span>
          <span>Broadcast disabled</span>
        </div>
        <div className="profileActions">
          <button className="button" type="button" onClick={() => void login()} disabled={!account.configured || !account.clientReady || busy}>{busy ? 'Opening…' : account.configured ? 'Log in with Turnkey' : 'Turnkey unavailable'}</button>
          <button className="button secondary" type="button" onClick={onClose}>Not now</button>
        </div>
      </div>
    </div>
  );
}

export function RequireAccountAction({ children, intent, onReady }: { children: (props: { requireAccount: () => Promise<boolean>; authenticated: boolean }) => ReactNode; intent?: string; onReady?: () => void | Promise<void> }) {
  const gate = useRequireTurnkeyAccount();
  return (
    <>
      {children({ authenticated: gate.account.authenticated, requireAccount: () => gate.requireAccount(onReady) })}
      <AccountGatePrompt open={gate.promptOpen} onClose={() => gate.setPromptOpen(false)} intent={intent} />
    </>
  );
}
