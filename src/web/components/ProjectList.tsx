import { AlertTriangle, Download, Play, RotateCw, Square, Terminal } from 'lucide-react';
import type { Project } from '@/api';
import { formatDate } from '@/lib/format';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { CopyButton } from './CopyButton';
import { kindLabel } from './ProjectCard';
import { StatusBadge } from './StatusBadge';
import { ActionButton } from './ui/action-button';

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
            <th className="px-3 py-2.5">{t('list.lastCommit')}</th>
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
                <td className="max-w-[300px] px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-zinc-200">{project.name}</span>
                    {project.version ? (
                      <span className="shrink-0 font-mono text-[10px] text-zinc-600">v{project.version}</span>
                    ) : null}
                    <CopyButton value={project.path} className="h-5 w-5" />
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
                <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-zinc-500">
                  {formatDate(project.createdAt)}
                </td>
                <td className="max-w-[240px] px-3 py-2.5">
                  {project.git ? (
                    <>
                      <div className="font-mono text-[10px] text-zinc-500">{project.git.lastDate || '—'}</div>
                      <div className="truncate text-[11px] text-zinc-400" title={project.git.lastCommit}>
                        {project.git.lastCommit || '—'}
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {project.entry ? (
                      running ? (
                        <ActionButton
                          tone="stop"
                          label={t('action.stop')}
                          icon={<Square size={11} />}
                          disabled={busy}
                          onClick={() => onAction(project, 'stop')}
                        />
                      ) : (
                        <ActionButton
                          tone="start"
                          label={t('action.start')}
                          icon={<Play size={11} />}
                          disabled={busy}
                          onClick={() => onAction(project, 'start')}
                        />
                      )
                    ) : null}
                    {project.entry ? (
                      <ActionButton
                        tone="restart"
                        label={t('action.restart')}
                        icon={<RotateCw size={11} className={cn(busy && 'animate-spin')} />}
                        disabled={busy}
                        onClick={() => onAction(project, 'restart')}
                      />
                    ) : null}
                    {project.entry && project.dependencies && !project.dependencies.installed ? (
                      <ActionButton
                        tone="install"
                        label={t('action.install')}
                        icon={<Download size={11} />}
                        disabled={busy}
                        onClick={() => onAction(project, 'install')}
                      />
                    ) : null}
                    <ActionButton
                      tone="log"
                      label={t('action.logs')}
                      icon={<Terminal size={11} />}
                      onClick={() => onOpen(project)}
                    />
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
