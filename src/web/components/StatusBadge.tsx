import type { ProjectStatus } from '@/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const LABEL: Record<ProjectStatus, MessageKey> = {
  running: 'status.running',
  stopped: 'status.stopped',
  unknown: 'status.unknown',
  'n/a': 'status.na',
};

const STYLE: Record<ProjectStatus, string> = {
  running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  stopped: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
  unknown: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'n/a': 'border-zinc-800 bg-zinc-900/60 text-zinc-500',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useI18n();
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]', STYLE[status])}>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'running' ? 'bg-emerald-400' : status === 'unknown' ? 'bg-amber-400' : 'bg-zinc-600',
        )}
      />
      {t(LABEL[status])}
    </span>
  );
}
