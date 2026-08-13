'use client';

import type { ReactNode } from 'react';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';
import { BondrLandingPage } from './BondrLandingPage';

export function HomeGate({ authenticated }: { authenticated: ReactNode }) {
  const account = useBondrTurnkeyAccount();
  if (!account.authenticated) return <BondrLandingPage />;
  return <>{authenticated}</>;
}
