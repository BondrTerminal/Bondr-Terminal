import type { Metadata } from 'next';
import '@turnkey/react-wallet-kit/styles.css';
import './globals.css';
import { TurnkeyAccountProvider } from './components/TurnkeyAccountProvider';
import { BondrPlatformShell } from './components/BondrPlatformShell';

export const metadata: Metadata = {
  title: 'Bond.Terminal',
  description: 'Bond.Terminal is a secured Solana operator command hub for autonomous liquidity, market making, scalper workflows, launch operations, wallet operations, portfolio reads, and gated browser-wallet execution.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TurnkeyAccountProvider>
          <BondrPlatformShell>{children}</BondrPlatformShell>
        </TurnkeyAccountProvider>
      </body>
    </html>
  );
}
