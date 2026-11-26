import { AlertTriangle, ArrowLeft, Check, Copy, Download, Play, RotateCw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchProject, type Project } from '@/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Terminal } from './Terminal';
import { KIND_ICON, kindLabel } from './ProjectCard';
import { StatusBadge } from './StatusBadge';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

function CopyButton({ value }: { value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy} title={t('common.copy')}>
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </Button>
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

export function ProjectDetail({
  project,
  busy,
  onBack,
  onAction,
}: {
  project: Project;
  busy: boolean;
  onBack: () => void;
  onAction: (project: Project, action: 'start' | 'stop' | 'restart' | 'install') => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'overview' | 'terminal'>(
    project.status === 'running' ? 'terminal' : 'overview',
  );
  const [readme, setReadme] = useState('');
  const [loading, setLoading] = useState(true);
  const wasRunning = useRef(project.status === 'running');

  // 从停止切到运行，或启动失败，都直接切到终端，让用户马上看到输出
  useEffect(() => {
    const running = project.status === 'running';
    if ((running && !wasRunning.current) || (project.failure && !wasRunning.current)) {
      setTab('terminal');
    }
    wasRunning.current = running;
  }, [project.status, project.failure]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchProject(project.id)
      .then((data) => {
        if (alive) setReadme(data.readme);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [project.id]);

  const Icon = KIND_ICON[project.kind];
  const entry = project.entry ? [project.entry.cmd, ...project.entry.args].join(' ') : '';
  const running = project.status === 'running';

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800/70 pb-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} title={t('common.back')}>
            <ArrowLeft size={16} />
          </Button>
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700/60 bg-zinc-800/60 text-zinc-300">
            <Icon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-zinc-100">{project.name}</h2>
              {project.version ? <span className="font-mono text-xs text-zinc-500">v{project.version}</span> : null}
              <StatusBadge status={project.status} failing={Boolean(project.failure)} />
              <Badge variant="mono">{t(kindLabel(project.kind))}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="truncate font-mono text-[11px] text-zinc-500">{project.path}</code>
              <CopyButton value={project.path} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {project.entry ? (
              running ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => onAction(project, 'stop')}>
                  <Square size={12} />
                  {t('action.stop')}
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => onAction(project, 'start')}>
                  <Play size={12} />
                  {t('action.start')}
                </Button>
              )
            ) : (
              <Badge variant="mono">{t('detail.noStartCommand')}</Badge>
            )}
            {project.entry ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction(project, 'restart')}>
                <RotateCw size={12} className={cn(busy && 'animate-spin')} />
                {t('action.restart')}
              </Button>
            ) : null}
            {project.entry && project.dependencies && !project.dependencies.installed ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => onAction(project, 'install')}
                title={t('detail.depsInstallHint')}
              >
                <Download size={12} />
                {t('action.install')}
              </Button>
            ) : null}
          </div>
        </div>

        {project.failure ? (
          <div
            data-testid="failure-banner"
            className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 pl-12"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-red-300">
                {t('detail.failure')}：{t(`fail.${project.failure.code}` as MessageKey)}
              </div>
              {project.failure.line ? (
                <code className="mt-0.5 block truncate font-mono text-[10px] text-red-400/70">
                  {project.failure.line}
                </code>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setTab('terminal')}
              className="shrink-0 rounded-md border border-red-500/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
            >
              {t('detail.viewLogs')}
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-1 border-b border-transparent pl-12">
          {(
            [
              ['overview', 'detail.overview'],
              ['terminal', 'detail.terminal'],
            ] as const
          ).map(([key, labelKey]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs transition-colors',
                tab === key ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {t(labelKey)}
            </button>
          ))}
          {running ? <span className="ml-2 text-[10px] text-emerald-400">● {t('detail.runningIndicator')}</span> : null}
        </div>
      </div>

      {tab === 'terminal' ? (
        <div className="mt-4 min-h-0 flex-1">
          <Terminal projectId={project.id} running={running} />
        </div>
      ) : (
        <div className="mt-4 grid min-h-0 flex-1 gap-5 overflow-y-auto lg:grid-cols-[340px_1fr]">
          <div className="space-y-4">
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t('detail.runInfo')}
              </h3>
              <Row label={t('detail.type')}>{t(kindLabel(project.kind))}</Row>
              <Row label={t('detail.runtime')}>{project.runtime === 'none' ? '—' : project.runtime}</Row>
              <Row label={t('detail.entry')}>
                {entry ? <code className="font-mono text-[10px] text-emerald-300">{entry}</code> : '—'}
              </Row>
              <Row label={t('detail.supervisor')}>
                {running ? (
                  <span className="text-emerald-300">ProjectDeck</span>
                ) : project.supervisor === 'docker' ? (
                  'Docker'
                ) : (
                  t('detail.notRunning')
                )}
              </Row>
              <Row label={t('detail.port')}>
                {project.ports.length ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {project.ports.map((port) => (
                      <span
                        key={port.port}
                        className={cn(
                          'rounded px-1.5 py-0.5 font-mono text-[10px]',
                          port.open ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-500',
                        )}
                      >
                        :{port.port}
                      </span>
                    ))}
                  </span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label={t('detail.deps')}>
                {project.dependencies?.hasManifest ? (
                  <span
                    className={cn(
                      'font-mono',
                      project.dependencies.installed ? 'text-emerald-300' : 'text-amber-300',
                    )}
                  >
                    {project.dependencies.manager} ·{' '}
                    {t(project.dependencies.installed ? 'detail.depsReady' : 'detail.depsMissing')}
                  </span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label={t('detail.createdAt')}>{formatDate(project.createdAt)}</Row>
              <Row label={t('detail.lastOperation')}>{formatDateTime(project.lastOperation)}</Row>
            </section>

            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t('detail.stack')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {project.stack.length ? (
                  project.stack.map((item) => (
                    <Badge key={item} variant="mono">
                      {item}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[11px] text-zinc-600">—</span>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t('detail.git')}
              </h3>
              {project.git ? (
                <>
                  <Row label={t('detail.branch')}>
                    <span className="font-mono">
                      {project.git.branch || '—'}
                      {project.git.dirty > 0 ? <span className="ml-1 text-amber-400">±{project.git.dirty}</span> : null}
                    </span>
                  </Row>
                  <Row label={t('detail.lastCommit')}>{project.git.lastDate || '—'}</Row>
                  <Row label={t('detail.commit')}>
                    <span className="line-clamp-2 font-mono text-[10px] text-zinc-500">{project.git.lastCommit || '—'}</span>
                  </Row>
                </>
              ) : (
                <p className="text-[11px] text-zinc-600">{t('detail.notGit')}</p>
              )}
            </section>

            {project.artifacts.length ? (
              <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
                <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {t('detail.artifacts')}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {project.artifacts.map((artifact) => (
                    <Badge key={artifact.name} variant="amber">
                      {artifact.name}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <section className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-medium text-zinc-400">{t('detail.readme')}</h3>
              <span className="text-[10px] text-zinc-600">
                {project.readmeFile ?? t('detail.readmeMissing')}
              </span>
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-800" />
              </div>
            ) : readme ? (
              <div className="md">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
                >
                  {readme}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-xs text-zinc-600">{t('detail.noReadme')}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
