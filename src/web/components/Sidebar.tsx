import { LayoutDashboard, List, ScanLine, Settings } from 'lucide-react';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type NavKey = 'dashboard' | 'projects' | 'settings';

const NAV: { key: NavKey; labelKey: MessageKey; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { key: 'projects', labelKey: 'nav.projects', icon: List },
  { key: 'settings', labelKey: 'nav.settings', icon: Settings },
];

export function Sidebar({
  active,
  total,
  running,
  scanning,
  scannedAt,
  onNavigate,
  onScan,
}: {
  active: NavKey;
  total: number;
  running: number;
  scanning: boolean;
  scannedAt?: string;
  onNavigate: (key: NavKey) => void;
  onScan: () => void;
}) {
  const { t } = useI18n();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-zinc-800/70 bg-[#0a0b0d]">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
          <svg viewBox="0 0 64 64" className="h-5 w-5">
            <path d="M32 10 54 21 32 32 10 21Z" fill="currentColor" opacity="0.95" />
            <path d="M10 31 32 42 54 31" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
            <path d="M10 42 32 53 54 42" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
          </svg>
        </span>
        <div>
          <div className="text-[15px] font-semibold leading-5 tracking-tight text-zinc-100">ProjectDeck</div>
          <div className="text-[11px] leading-4 text-zinc-500">{t('app.tagline')}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                selected
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200',
              )}
            >
              <Icon size={16} strokeWidth={1.9} />
              <span>{t(item.labelKey)}</span>
              {item.key === 'projects' ? (
                <span className={cn('ml-auto font-mono text-[11px]', selected ? 'text-emerald-400/80' : 'text-zinc-600')}>
                  {total}
                </span>
              ) : item.key === 'dashboard' ? (
                <span className={cn('ml-auto font-mono text-[11px]', selected ? 'text-emerald-400/80' : 'text-zinc-600')}>
                  {t('nav.runningCount', { count: running })}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <ScanLine size={12} />
            {t('nav.scanCenter')}
          </div>
          <p className="mb-3 text-[11px] leading-4 text-zinc-600">
            {scannedAt
              ? t('nav.lastScan', { time: new Date(scannedAt).toLocaleTimeString() })
              : t('nav.neverScanned')}
          </p>
          <button
            type="button"
            onClick={onScan}
            disabled={scanning}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 text-xs font-medium text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
          >
            {scanning ? t('nav.scanning') : t('nav.rescan')}
          </button>
        </div>
        <div className="mt-3 px-1 text-[10px] text-zinc-700">{t('nav.footer')}</div>
      </div>
    </aside>
  );
}
