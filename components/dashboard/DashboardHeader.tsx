import Link from 'next/link';
import { RefreshButton } from './RefreshButton';
import { SyncStatusPill } from './SyncStatusPill';

const NAV_ITEMS = [
  { href: '/matrix', label: 'Volume Matrix' },
  { href: '/capacity', label: 'Cutting Lines' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/expected-to-ship', label: 'Expected to Ship' },
  { href: '/carrier', label: 'Carriers' },
];

export function DashboardHeader({ active }: { active: string }) {
  return (
    <header className="border-b divider bg-paper">
      <div className="max-w-[1600px] mx-auto px-8 pt-7 pb-5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-6">
          <Link href="/matrix" className="block">
            <div className="eyebrow text-ink-muted">BEWI &middot; Howden &middot; S03</div>
            <div className="headline text-3xl tracking-tightest mt-0.5">
              Operational <em className="not-italic font-medium">Volume</em> Report
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <SyncStatusPill />
          <RefreshButton />
        </div>
      </div>
      <nav className="max-w-[1600px] mx-auto px-8 flex gap-7 -mb-px">
        {NAV_ITEMS.map(item => {
          const isActive = item.href === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`pb-3 text-sm tracking-tight transition-colors border-b-2 ${
                isActive
                  ? 'border-ink text-ink font-medium'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
