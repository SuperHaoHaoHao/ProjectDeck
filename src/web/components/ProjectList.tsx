import { AlertTriangle, Download, Play, RotateCw, Square, Terminal } from 'lucide-react';
import type { Project } from '@/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { kindLabel } from './ProjectCard';
import { StatusBadge } from './StatusBadge';

function ActionButton({
  title,
  disabled,
  onClick,
  tone,
  children,
  label,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  tone: 'start' | 'stop' | 'restart' | 'log' | 'install';
  children: React.ReactNode;
  label?: string;
}) {
  const styles = {
    start: 'hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300',
    stop: 'hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300',
    restart: 'hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300',
    log: 'hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-300',
    install: 'hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300',
  }[tone];
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-7 items-center justify-center gap-1 rounded-md border border-zinc-800 px-2 font-mono text-[10px] text-zinc-500 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        styles,
      )}
    >
      {children}
      {label ? <span className="hidden xl:inline">{label}</span> : null}
    </button>
  );
}

export function ProjectList({
  projects,
  busyId,
  onOpen,
  onAction,
}: {
  projects: Project[];
  busyId?: string;
  onOpen: (project: Project) => void;
  onAction: (project: Project, action: 'start' | 'stop' | 'restart' | 'install') => void;
}) {
  const { t } = useI18n();

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/30">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-[11px] font-medium text-zinc-500">
            <th className="px-4 py-2.5">{t('list.project')}</th>
            <th className="px-3 py-2.5">{t('list.kind')}</th>
            <th className="px-3 py-2.5">{t('list.status')}</th>
            <th className="px-3 py-2.5">{t('list.ports')}</th>
            <th className="px-3 py-2.5">{t('list.createdAt')}</th>
            <th className="px-3 py-2.5">{t('list.lastOperation')}</th>
            <th className="px-4 py-2.5 text-right">{t('list.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const running = project.status === 'running';
            const busy = busyId === project.id;
            return (
              <tr
                key={project.id}
                onClick={() => onOpen(project)}
                className="cursor-pointer border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30"
              >
                <td className="max-w-[320px] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-zinc-200">{project.name}</span>
                    {project.version ? (
                      <span className="shrink-0 font-mono text-[10px] text-zinc-600">v{project.version}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">{project.path}</div>
                  {project.failure ? (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-red-400">
                      <AlertTriangle size={10} />
                      <span className="truncate">
                        {t(`fail.${project.failure.code}` as MessageKey)}
                        {project.failure.line ? (
                          <span className="ml-1 font-mono text-[10px] text-red-500/60">{project.failure.line}</span>
                        ) : null}
                      </span>
                    </div>
                  ) : project.dependencies && !project.dependencies.installed ? (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400/90">
                      <Download size={10} />
                      {t('list.needsInstall')}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">{t(kindLabel(project.kind))}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={project.status} failing={Boolean(project.failure)} />
                </td>
                <td className="px-3 py-2.5">
                  {project.stablePort ? (
                    <span
                      title={t('stable.title')}
                      data-testid="stable-port-chip"
                      className="mb-1 inline-flex items-center gap-1 rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-300"
                    >
                      →:{project.stablePort.port}
                    </span>
                  ) : null}
                  {project.ports.length ? (
                    <div className="flex flex-wrap gap-1">
                      {project.ports.map((port) => (
                        <span
                          key={port.port}
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-[10px]',
                            port.open ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800/70 text-zinc-500',
                          )}
                        >
                          {port.port}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-500">{formatDate(project.createdAt)}</td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-500">
                  {formatDateTime(project.lastOperation ?? project.git?.lastDate)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {project.entry ? (
                      running ? (
                        <ActionButton
                          title={t('action.stop')}
                          label={t('action.stop')}
                          tone="stop"
                          disabled={busy}
                          onClick={() => onAction(project, 'stop')}
                        >
                          <Square size={12} />
                        </ActionButton>
                      ) : (
                        <ActionButton
                          title={t('action.start')}
                          label={t('action.start')}
                          tone="start"
                          disabled={busy}
                          onClick={() => onAction(project, 'start')}
                        >
                          <Play size={12} />
                        </ActionButton>
                      )
                    ) : null}
                    {project.entry ? (
                      <ActionButton
                        title={t('action.restart')}
                        label={t('action.restart')}
                        tone="restart"
                        disabled={busy}
                        onClick={() => onAction(project, 'restart')}
                      >
                        <RotateCw size={12} className={cn(busy && 'animate-spin')} />
                      </ActionButton>
                    ) : null}
                    {project.entry && project.dependencies && !project.dependencies.installed ? (
                      <ActionButton
                        title={t('action.install')}
                        label={t('action.install')}
                        tone="install"
                        disabled={busy}
                        onClick={() => onAction(project, 'install')}
                      >
                        <Download size={12} />
                      </ActionButton>
                    ) : null}
                    <ActionButton title={t('action.logs')} label={t('action.logs')} tone="log" onClick={() => onOpen(project)}>
                      <Terminal size={12} />
                    </ActionButton>
                  </div>
                </td>
              </tr>
            );
          })}
          {projects.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-16 text-center text-xs text-zinc-600">
                {t('list.empty')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
