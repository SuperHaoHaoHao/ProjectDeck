import { AlertTriangle, FolderSearch, RefreshCw, X } from 'lucide-react';
import type { ScanResult } from '@/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function ScanModal({
  open,
  report,
  scanning,
  onClose,
  onRescan,
}: {
  open: boolean;
  report: ScanResult | null;
  scanning: boolean;
  onClose: () => void;
  onRescan: () => void;
}) {
  const { t } = useI18n();
  if (!open) return null;

  const ignoreList = report
    ? `${report.ignore.slice(0, 10).join(', ')}${report.ignore.length > 10 ? t('scan.rule.more') : ''}`
    : '';

  const rules = report
    ? [
        t('scan.rule.roots', { roots: report.roots.join(', ') }),
        t('scan.rule.depth', { depth: report.maxDepth }),
        t('scan.rule.runnable'),
        t('scan.rule.skip'),
        t('scan.rule.descend'),
        t('scan.rule.ignore', { list: ignoreList }),
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b0c0f] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            <FolderSearch size={15} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{t('scan.title')}</h2>
            <p className="text-[11px] text-zinc-500">{t('scan.subtitle')}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRescan} disabled={scanning}>
              <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
              {t('scan.rescan')}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {report ? (
            <>
              <div className="mb-4 grid gap-2 sm:grid-cols-4">
                {[
                  [t('scan.collected'), String(report.projects.length)],
                  [t('scan.filtered'), String(report.skipped.length)],
                  [t('scan.dirs'), String(report.scannedDirs)],
                  [t('scan.time'), `${report.durationMs}ms`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                    <div className="text-[10px] text-zinc-500">{label}</div>
                    <div className="mt-0.5 text-lg font-semibold text-zinc-100">{value}</div>
                  </div>
                ))}
              </div>

              <section className="mb-4">
                <h3 className="mb-2 text-[11px] font-medium text-zinc-400">{t('scan.roots')}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {report.roots.map((root) => (
                    <Badge key={root} variant="mono">
                      {root}
                    </Badge>
                  ))}
                </div>
              </section>

              <section className="mb-4">
                <h3 className="mb-2 text-[11px] font-medium text-zinc-400">{t('scan.rules')}</h3>
                <ul className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2">
                  {rules.map((rule) => (
                    <li key={rule} className="flex gap-2 text-[11px] leading-5 text-zinc-400">
                      <span className="text-emerald-500">·</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </section>

              {report.errors.length ? (
                <section className="mb-4">
                  <h3 className="mb-2 flex items-center gap-1 text-[11px] font-medium text-amber-300">
                    <AlertTriangle size={12} />
                    {t('scan.errors')}
                  </h3>
                  <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    {report.errors.map((error) => (
                      <p key={error} className="font-mono text-[10px] text-amber-200/80">
                        {error}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 text-[11px] font-medium text-zinc-400">
                  {t('scan.filteredDirs', { count: report.skipped.length })}
                </h3>
                {report.skipped.length ? (
                  <div className="max-h-[260px] overflow-y-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
                        <tr>
                          <th className="px-3 py-1.5 font-medium">{t('scan.path')}</th>
                          <th className="px-3 py-1.5 font-medium">{t('scan.reason')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.skipped.map((item) => (
                          <tr key={item.path} className="border-t border-zinc-800/60">
                            <td className="max-w-[420px] truncate px-3 py-1.5 font-mono text-[10px] text-zinc-400">
                              {item.path}
                            </td>
                            <td className="px-3 py-1.5 text-zinc-500">
                              {t(`scan.reason.${item.reason}` as MessageKey)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-600">{t('scan.none')}</p>
                )}
              </section>
            </>
          ) : (
            <p className="py-10 text-center text-xs text-zinc-500">{t('scan.empty')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
