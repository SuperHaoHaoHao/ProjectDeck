import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchConfig } from '@/api';
import { useI18n } from '@/lib/i18n';
import { Button } from './ui/button';

export function SettingsView() {
  const { t } = useI18n();
  const [config, setConfig] = useState<Awaited<ReturnType<typeof fetchConfig>> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  const copy = async () => {
    if (!config) return;
    await navigator.clipboard.writeText(config.configPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-2xl space-y-4">
      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-200">{t('settings.title')}</h2>
        {config ? (
          <div className="space-y-2 text-xs">
            <Row label={t('settings.configFile')}>
              <span className="flex items-center gap-1">
                <code className="font-mono text-[11px] text-zinc-400">{config.configPath}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copy} title={t('common.copy')}>
                  {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </Button>
              </span>
            </Row>
            <Row label={t('settings.listen')}>
              <code className="font-mono text-[11px]">
                {config.host}:{config.port}
              </code>
            </Row>
            <Row label={t('settings.maxDepth')}>{config.maxDepth}</Row>
            <Row label={t('settings.includeNonRunnable')}>
              {config.includeNonRunnable ? t('settings.yes') : t('settings.no')}
            </Row>
            <Row label={t('settings.roots')}>
              <div className="flex flex-wrap justify-end gap-1">
                {config.roots.map((root) => (
                  <code key={root} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px]">
                    {root}
                  </code>
                ))}
              </div>
            </Row>
          </div>
        ) : (
          <p className="text-xs text-zinc-600">{t('settings.loading')}</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 text-xs leading-6 text-zinc-400">
        <h2 className="mb-2 text-sm font-medium text-zinc-200">{t('settings.howToTitle')}</h2>
        <p>{t('settings.howTo1')}</p>
        <p className="mt-2 text-zinc-500">
          {t('settings.howTo2')}{' '}
          <code className="font-mono text-zinc-300">projectdeck --root ~/Work --root ~/Code</code>
        </p>
        <p className="mt-2 text-zinc-500">{t('settings.howTo3')}</p>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-800/50 py-2 last:border-0">
      <span className="shrink-0 text-[11px] text-zinc-500">{label}</span>
      <span className="min-w-0 text-right text-[11px] text-zinc-300">{children}</span>
    </div>
  );
}
