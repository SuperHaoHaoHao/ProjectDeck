import { Link2, Unlink } from 'lucide-react';
import { useState } from 'react';
import type { Project } from '@/api';
import { useI18n } from '@/lib/i18n';
import { Button } from './ui/button';

export function StablePortCard({
  project,
  busy,
  onChange,
}: {
  project: Project;
  busy?: boolean;
  onChange: (project: Project, port: number | null) => Promise<void>;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const stable = project.stablePort;

  const save = async (port: number | null) => {
    setError('');
    if (port !== null && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      setError(t('stable.invalid'));
      return;
    }
    setSaving(true);
    try {
      await onChange(project, port);
      if (port === null) setValue('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      data-testid="stable-port-card"
      className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3"
    >
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        <Link2 size={11} />
        {t('stable.title')}
      </h3>

      {stable ? (
        <div className="space-y-2">
          <div className="font-mono text-[11px] text-emerald-300">
            :{stable.port}
            {stable.target ? (
              <span className="text-zinc-500"> → :{stable.target}</span>
            ) : (
              <span className="block text-[10px] text-zinc-600">{t('stable.waiting')}</span>
            )}
          </div>
          <Button variant="outline" size="sm" disabled={busy || saving} onClick={() => save(null)}>
            <Unlink size={11} />
            {t('stable.clear')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] leading-5 text-zinc-500">{t('stable.hint')}</p>
          <div className="flex gap-1.5">
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t('stable.placeholder')}
              inputMode="numeric"
              aria-label={t('stable.title')}
              className="h-7 w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none"
            />
            <Button size="sm" disabled={busy || saving} onClick={() => save(Number(value))}>
              <Link2 size={11} />
              {t('stable.bind')}
            </Button>
          </div>
        </div>
      )}

      {error ? <p className="mt-1.5 text-[10px] text-red-400">{error}</p> : null}
    </section>
  );
}
