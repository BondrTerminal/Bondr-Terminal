import type { Metadata } from 'next';
import '@turnkey/react-wallet-kit/styles.css';
import './globals.css';
import { GlobalCreateProjectAction } from './components/GlobalCreateProjectAction';
import { HeaderWalletChip } from './components/HeaderWalletChip';

export const metadata: Metadata = {
  title: 'Bond.Terminal',
  description: 'Bond.Terminal is a Solana launch operating system with browser-wallet signing, wallet operations, project configuration, portfolio reads, and gated execution.'
};

const navItems = [
  { href: '/', label: 'Hub' },
  { href: '/deployment', label: 'Deployment' },
  { href: '/sniper', label: 'Terminal' },
  { href: '/wallets', label: 'Wallets' },
  { href: '/projects', label: 'Projects' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/token-analyzer', label: 'Analyzer' }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="bondrAppFrame">
          <header className="bondrTopHeader" aria-label="Bond.Terminal application header">
            <a className="bondrWordmark" href="/" aria-label="Bond.Terminal home">
              <span className="bondrLogoText" aria-label="BONDR">
                <span>B</span><span className="bondrScopeO">O</span><span>N</span><span>D</span><span>R</span>
              </span>
            </a>
            <nav className="bondrHeaderNav" aria-label="Main navigation">
              {navItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
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
