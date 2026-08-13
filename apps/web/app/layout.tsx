import type { Metadata } from 'next';
import '@turnkey/react-wallet-kit/styles.css';
import './globals.css';
import { GlobalCreateProjectAction } from './components/GlobalCreateProjectAction';
import { HeaderWalletChip } from './components/HeaderWalletChip';

export const metadata: Metadata = {
  title: 'Bond.Terminal',
  description: 'Bond.Terminal is a Solana command hub for autonomous liquidity, market making, scalper workflows, launch operations, wallet operations, portfolio reads, and gated browser-wallet execution.'
};

const navItems = [
  { href: '/', label: 'Hub' },
  { href: '/liquidity', label: 'Liquidity Engine' },
  { href: '/sniper', label: 'Terminal' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/deployment', label: 'Deployment' },
  { href: '/projects', label: 'Projects' },
  { href: '/project-dashboard', label: 'Project Dashboard' },
  { href: '/wallets', label: 'Wallet Ops' },
  { href: '/profile', label: 'Profile' }
];

const toolItems = [
  { href: '/liquidity', label: 'Market Maker / Scalper' },
  { href: '/token-analyzer', label: 'Token Analyzer' },
  { href: '/github', label: 'GitHub / Ops' },
  { href: '/live-beta-test', label: 'Signing Harness' }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="appFrame bondrFinalShell">
          <aside className="sideToolbar" aria-label="Bond.Terminal navigation">
            <a className="brandMark sideBrand" href="/" aria-label="Bond.Terminal home">
              <span className="brandGlyph">B</span>
              <span>
                <strong>Bond.Terminal</strong>
                <small>Solana command hub</small>
              </span>
            </a>
            <nav aria-label="Main navigation">
              {navItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
            </nav>
            <div className="sideTools" aria-label="Tools navigation">
              <span>Tools</span>
              {toolItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
            </div>
            <div className="sideStatus">
              <span>Flagship</span>
              <strong>Liquidity Engine</strong>
              <small>Market maker / scalper cockpit</small>
            </div>
            <div className="sideSessionRail" aria-label="Wallet and project controls">
              <HeaderWalletChip />
              <GlobalCreateProjectAction />
            </div>
          </aside>
          <div className="appContent">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
