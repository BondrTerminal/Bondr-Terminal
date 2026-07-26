import type { Metadata } from 'next';
import '@turnkey/react-wallet-kit/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meridian',
  description: 'Meridian is a Solana liquidity and trading command hub for autonomous market making, sniper workflows, wallet operations, and developer tooling.'
};

const navItems = [
  { href: '/', label: 'Hub' },
  { href: '/liquidity', label: 'Liquidity Engine' },
  { href: '/sniper', label: 'Trading Terminal' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/token-analyzer', label: 'Token Analyzer' },
  { href: '/deployment', label: 'Deployment' },
  { href: '/projects', label: 'Projects' },
  { href: '/project-dashboard', label: 'Project Dashboard' },
  { href: '/wallets', label: 'Wallet Ops' },
  { href: '/github', label: 'GitHub' },
  { href: '/profile', label: 'Profile' }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="appFrame">
          <aside className="sideToolbar" aria-label="Meridian navigation">
            <a className="brandMark sideBrand" href="/" aria-label="Meridian home">
              <span className="brandGlyph">M</span>
              <span>
                <strong>Meridian</strong>
                <small>Solana command hub</small>
              </span>
            </a>
            <nav aria-label="Main navigation">
              {navItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
            </nav>
            <div className="sideStatus">
              <span>Flagship</span>
              <strong>Liquidity Engine</strong>
              <small>Backend-wired mode</small>
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
