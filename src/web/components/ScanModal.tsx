import { AlertTriangle, FolderSearch, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { scanStreamUrl, type ScanProgress, type ScanResult } from '@/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function ScanModal({
  open,
  report,
  scanToken,
  onClose,
  onRescan,
  onResult,
  onFailed,
}: {
  open: boolean;
  report: ScanResult | null;
  scanToken: number;
  onClose: () => void;
  onRescan: () => void;
  onResult: (result: ScanResult) => void;
  onFailed: (message: string) => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || scanToken === 0) return;
    const controller = new AbortController();
    setPhase('scanning');
    setProgress(null);
    setError('');

    void (async () => {
      try {
        const response = await fetch(scanStreamUrl(), { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const event = block.split('\n').find((line) => line.startsWith('event: '))?.slice(7).trim();
            const raw = block.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
            if (!event || !raw) continue;
            const data = JSON.parse(raw) as ScanProgress | ScanResult | { message: string };

            if (event === 'progress') setProgress(data as ScanProgress);
            if (event === 'done') {
              setPhase('done');
              onResult(data as ScanResult);
            }
            if (event === 'error') {
              const message = (data as { message: string }).message;
              setPhase('error');
              setError(message);
              onFailed(message);
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setPhase('error');
        setError((err as Error).message);
        onFailed((err as Error).message);
      }
    })();

    return () => controller.abort();
    // onResult / onFailed 故意不放进依赖，避免父组件重渲染时中断扫描
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scanToken]);

  if (!open) return null;

  const scanning = phase === 'scanning';
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
          {scanning ? (
            <div
              data-testid="scan-progress"
              className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-emerald-300">
                  <Loader2 size={13} className="animate-spin" />
                  {t('scan.running')}
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  {((progress?.elapsedMs ?? 0) / 1000).toFixed(1)}s
                </span>
              </div>

              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <style>{`@keyframes scan-slide{0%{transform:translateX(-120%)}100%{transform:translateX(420%)}}`}</style>
                <div className="h-full w-1/3 animate-[scan-slide_1.1s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-emerald-500/10 via-emerald-400 to-emerald-500/10" />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  [t('scan.dirs'), progress?.scannedDirs ?? 0],
                  [t('scan.collected'), progress?.projects ?? 0],
                  [t('scan.filtered'), progress?.skipped ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-zinc-900/60 py-1.5">
                    <div className="font-mono text-sm text-zinc-100">{value}</div>
                    <div className="text-[10px] text-zinc-500">{label}</div>
                  </div>
                ))}
              </div>

              {progress?.currentPath ? (
                <p className="mt-2.5 truncate font-mono text-[10px] text-zinc-600">{progress.currentPath}</p>
              ) : null}

              {progress?.recent?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {progress.recent.map((name) => (
                    <span
                      key={name}
                      className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300/90"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === 'error' ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              <AlertTriangle size={14} className="mt-0.5" />
              {t('scan.failed', { error })}
            </div>
          ) : null}

          {report && !scanning ? (
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
                    {report.errors.map((item) => (
                      <p key={item} className="font-mono text-[10px] text-amber-200/80">
                        {item}
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
          ) : !scanning ? (
            <p className="py-10 text-center text-xs text-zinc-500">{t('scan.empty')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
