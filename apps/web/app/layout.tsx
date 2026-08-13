import type { Metadata } from 'next';
import '@turnkey/react-wallet-kit/styles.css';
import './globals.css';
import { GlobalCreateProjectAction } from './components/GlobalCreateProjectAction';
import { HeaderWalletChip } from './components/HeaderWalletChip';

export const metadata: Metadata = {
  title: 'Bond.Terminal',
  description: 'Bond.Terminal is a Solana command hub for autonomous liquidity, market making, scalper workflows, launch operations, wallet operations, portfolio reads, and gated browser-wallet execution.'
};

const primaryNavItems = [
  { href: '/', label: 'Hub' },
  { href: '/liquidity', label: 'Liquidity Engine' },
  { href: '/sniper', label: 'Terminal' },
  { href: '/wallets', label: 'Wallets' },
  { href: '/projects', label: 'Projects' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/deployment', label: 'Deployment' }
];

const toolItems = [
  { href: '/liquidity', label: 'Market Maker / Scalper' },
  { href: '/token-analyzer', label: 'Token Analyzer' },
  { href: '/project-dashboard', label: 'Project Dashboard' },
  { href: '/github', label: 'GitHub / Ops' },
  { href: '/live-beta-test', label: 'Signing Harness' }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="bondrAppFrame bondrFinalShell">
          <header className="bondrTopHeader" aria-label="Bond.Terminal application header">
            <a className="bondrWordmark" href="/" aria-label="Bond.Terminal home">
              <span className="bondrLogoText" aria-label="BONDR">
                <span>B</span><span className="bondrScopeO">O</span><span>N</span><span>D</span><span>R</span>
              </span>
            </a>
            <nav className="bondrHeaderNav" aria-label="Main navigation">
              {primaryNavItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
              <details className="bondrToolsMenu">
                <summary>Tools</summary>
                <div className="bondrToolsMenuPanel">
                  {toolItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
                </div>
              </details>
            </nav>
            <div className="bondrHeaderActions" aria-label="Account and watch controls">
              <HeaderWalletChip />
              <GlobalCreateProjectAction />
              <a className="bondrHeaderAction" href="/wallets">Wallet Ops</a>
              <a className="bondrProfileOrb" href="/profile" aria-label="Open profile and account">B</a>
            </div>
          </header>
          <div className="bondrAppContent">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
