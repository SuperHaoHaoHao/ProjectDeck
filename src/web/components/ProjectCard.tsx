import {
  AppWindow,
  Boxes,
  FileText,
  Layers,
  Package,
  Play,
  Server,
  Smartphone,
  Square,
} from 'lucide-react';
import type { Project, ProjectKind } from '@/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';

export const KIND_ICON = {
  service: Server,
  desktop: AppWindow,
  miniapp: Smartphone,
  mobile: Smartphone,
  package: Package,
  docs: FileText,
} satisfies Record<ProjectKind, unknown>;

const KIND_COLOR: Record<ProjectKind, string> = {
  service: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  desktop: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  miniapp: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  mobile: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  package: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20',
  docs: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
};

function StatusDot({ status, failing }: { status: Project['status']; failing?: boolean }) {
  const color = failing
    ? 'bg-amber-400'
    : status === 'running'
      ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]'
      : status === 'error'
        ? 'bg-red-400'
        : status === 'stopped'
          ? 'bg-zinc-600'
          : 'bg-zinc-700';
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', color)} />;
}

export function ProjectCard({
  project,
  onOpen,
  onAction,
  busy,
}: {
  project: Project;
  onOpen: (project: Project) => void;
  onAction?: (project: Project, action: 'start' | 'stop') => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const Icon = KIND_ICON[project.kind] ?? Boxes;
  const visibleStack = project.stack.slice(0, 4);
  const hiddenStack = project.stack.length - visibleStack.length;

  const running = project.status === 'running';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(project)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen(project);
      }}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
              KIND_COLOR[project.kind],
            )}
          >
            <Icon size={15} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot status={project.status} failing={Boolean(project.failure)} />
              <h3 className="truncate text-[15px] font-semibold text-zinc-100">{project.name}</h3>
              {project.version ? (
                <span className="shrink-0 font-mono text-[11px] text-zinc-500">v{project.version}</span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
              {project.description || t('card.noDescription')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visibleStack.map((item) => (
          <Badge key={item} variant="mono">
            {item}
          </Badge>
        ))}
        {hiddenStack > 0 ? <Badge variant="mono">+{hiddenStack}</Badge> : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-800/60 pt-2.5">
        <div className="flex items-center gap-2">
          {project.ports.length ? (
            project.ports.slice(0, 2).map((port) => (
              <span
                key={port.port}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px]',
                  port.open ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800/70 text-zinc-500',
                )}
              >
                :{port.port}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-zinc-600">{t('card.noStart')}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-600">
          {project.git?.branch ? (
            <span className="max-w-[110px] truncate font-mono">{project.git.branch}</span>
          ) : null}
          {project.entry && onAction ? (
            <button
              type="button"
              data-testid="card-action"
              disabled={busy}
              title={running ? t('card.stop') : t('card.start')}
              onClick={(event) => {
                event.stopPropagation();
                onAction(project, running ? 'stop' : 'start');
              }}
              className={cn(
                'flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] transition-colors disabled:opacity-40',
                running
                  ? 'border-red-500/30 text-red-300 hover:bg-red-500/10'
                  : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10',
              )}
            >
              {running ? <Square size={9} /> : <Play size={9} />}
              {running ? t('card.stop') : t('card.start')}
            </button>
          ) : (
            <Layers size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      </div>
    </div>
  );
}

export function kindLabel(kind: ProjectKind): MessageKey {
  return `kind.${kind}` as MessageKey;
}
