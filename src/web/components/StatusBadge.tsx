import type { ProjectStatus } from '@/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const LABEL: Record<ProjectStatus, MessageKey> = {
  running: 'status.running',
  stopped: 'status.stopped',
  error: 'status.error',
  unknown: 'status.unknown',
  'n/a': 'status.na',
};

const STYLE: Record<ProjectStatus, string> = {
  running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  stopped: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
  unknown: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'n/a': 'border-zinc-800 bg-zinc-900/60 text-zinc-500',
};

const DOT: Record<ProjectStatus, string> = {
  running: 'bg-emerald-400',
  stopped: 'bg-zinc-600',
  error: 'bg-red-400',
  unknown: 'bg-amber-400',
  'n/a': 'bg-zinc-600',
};

export function StatusBadge({ status, failing }: { status: ProjectStatus; failing?: boolean }) {
  const { t } = useI18n();
  // 进程组还活着、但日志里已经报错（比如 monorepo 里某个子服务挂了）
  const degraded = status === 'running' && failing;
  return (
    <span
      data-status={degraded ? 'degraded' : status}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]',
        degraded ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : STYLE[status],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', degraded ? 'bg-amber-400' : DOT[status])} />
      {degraded ? t('status.degraded') : t(LABEL[status])}
    </span>
  );
}
