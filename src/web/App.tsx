import { AlertTriangle, CheckCircle2, Languages, RefreshCw, Search, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchProjects,
  installProject,
  rescan,
  restartProject,
  startProject,
  stopProject,
  type ActionResult,
  type Project,
  type ProjectKind,
  type ScanResult,
} from '@/api';
import { Dashboard } from './components/Dashboard';
import { kindLabel } from './components/ProjectCard';
import { ProjectDetail } from './components/ProjectDetail';
import { ProjectList } from './components/ProjectList';
import { ScanModal } from './components/ScanModal';
import { SettingsView } from './components/SettingsView';
import { Sidebar, type NavKey } from './components/Sidebar';
import { Button } from './components/ui/button';
import { useI18n, type MessageKey } from './lib/i18n';
import { cn } from './lib/utils';

type Filter = ProjectKind | 'all';
type View =
  | { name: 'dashboard' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'settings' };

const FILTERS: Filter[] = ['all', 'service', 'desktop', 'miniapp', 'mobile'];

function viewToHash(view: View): string {
  if (view.name === 'project') return `#/project/${view.id}`;
  return `#/${view.name}`;
}

function hashToView(hash: string): View {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'project' && parts[1]) return { name: 'project', id: parts[1] };
  if (parts[0] === 'projects') return { name: 'projects' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'dashboard' };
}

export default function App() {
  const { t, lang, toggle } = useI18n();
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setViewState] = useState<View>(() => hashToView(window.location.hash));
  const [scanOpen, setScanOpen] = useState(
    () => new URLSearchParams(window.location.search).get('scan') === '1',
  );
  const [busyId, setBusyId] = useState<string>();
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  const refresh = useCallback(async (silent = true): Promise<ScanResult | null> => {
    try {
      const result = await fetchProjects();
      setData(result);
      setError('');
      return result;
    } catch (err) {
      if (!silent) setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const setView = useCallback((next: View) => {
    setViewState(next);
    window.history.replaceState(null, '', viewToHash(next));
  }, []);

  useEffect(() => {
    const onHashChange = () => setViewState(hashToView(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      const result = await rescan();
      setData(result);
      setScanOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const showToast = (text: string, tone: 'ok' | 'error') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  const act = async (project: Project, action: 'start' | 'stop' | 'restart' | 'install') => {
    setBusyId(project.id);
    try {
      let result: ActionResult;
      if (action === 'start') result = await startProject(project.id);
      else if (action === 'stop') result = await stopProject(project.id);
      else if (action === 'install') result = await installProject(project.id);
      else result = await restartProject(project.id);

      if (action === 'install') {
        showToast(
          result.ok
            ? t('app.toast.installed', { name: project.name })
            : t('app.toast.installFailed', {
                name: project.name,
                reason: t(`fail.${result.failure?.code ?? 'unknown'}` as MessageKey),
              }),
          result.ok ? 'ok' : 'error',
        );
      } else if ((action === 'start' || action === 'restart') && !result.ok) {
        // 启动失败要立刻说清楚原因，而不是假装成功
        showToast(
          t('app.toast.startFailed', {
            name: project.name,
            reason: t(`fail.${result.failure?.code ?? 'unknown'}` as MessageKey),
          }),
          'error',
        );
      } else {
        const toastKey =
          action === 'start'
            ? 'app.toast.started'
            : action === 'stop'
              ? 'app.toast.stopped'
              : 'app.toast.restarted';
        showToast(t(toastKey, { name: project.name }), 'ok');
        // 有些项目（比如 npm 包着一层 vite/nest）会晚一两秒才吐出错误
        if (action === 'start' || action === 'restart') {
          window.setTimeout(async () => {
            const fresh = await refresh();
            const updated = fresh?.projects.find((item) => item.id === project.id);
            if (updated?.failure) {
              showToast(
                t('app.toast.startFailed', {
                  name: project.name,
                  reason: t(`fail.${updated.failure.code}` as MessageKey),
                }),
                'error',
              );
            }
          }, 2500);
        }
      }
      window.setTimeout(() => refresh(), 500);
    } catch (err) {
      showToast(t('app.toast.failed', { action: t(`action.${action}`), error: (err as Error).message }), 'error');
    } finally {
      setBusyId(undefined);
    }
  };

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([['all', data?.projects.length ?? 0]]);
    for (const project of data?.projects ?? []) {
      map.set(project.kind, (map.get(project.kind) ?? 0) + 1);
    }
    return map;
  }, [data]);

  const projects = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (data?.projects ?? []).filter((project) => {
      if (filter !== 'all' && project.kind !== filter) return false;
      if (!keyword) return true;
      return (
        project.name.toLowerCase().includes(keyword) ||
        project.description.toLowerCase().includes(keyword) ||
        project.path.toLowerCase().includes(keyword) ||
        project.stack.some((item) => item.toLowerCase().includes(keyword))
      );
    });
  }, [data, filter, query]);

  const running = data?.projects.filter((project) => project.status === 'running').length ?? 0;
  const runnable = data?.projects.filter((project) => project.entry).length ?? 0;
  const selected =
    view.name === 'project' ? data?.projects.find((project) => project.id === view.id) ?? null : null;

  const title =
    view.name === 'dashboard'
      ? t('app.title.dashboard')
      : view.name === 'projects'
        ? t('app.title.projects')
        : view.name === 'settings'
          ? t('app.title.settings')
          : selected?.name ?? t('app.title.project');

  const activeNav: NavKey = view.name === 'project' ? 'projects' : (view.name as NavKey);
  const showSearch = view.name === 'dashboard' || view.name === 'projects';

  return (
    <div className="flex min-h-screen">
      <Sidebar
        active={activeNav}
        total={data?.projects.length ?? 0}
        running={running}
        scanning={scanning}
        scannedAt={data?.scannedAt}
        onNavigate={(key) =>
          setView(key === 'dashboard' ? { name: 'dashboard' } : key === 'projects' ? { name: 'projects' } : { name: 'settings' })
        }
        onScan={runScan}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800/70 bg-[#08090a]/85 px-6 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-zinc-200">{title}</h1>
            <p className="truncate text-[10px] text-zinc-600">
              {view.name === 'dashboard'
                ? t('app.subtitle.dashboard', { count: data?.projects.length ?? 0, running })
                : view.name === 'projects'
                  ? t('app.subtitle.projects')
                  : view.name === 'settings'
                    ? t('app.subtitle.settings')
                    : selected?.path ?? ''}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {showSearch ? (
              <div className="relative w-[300px]">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('app.search')}
                  className="h-8 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 pl-9 pr-8 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
                  >
                    <XCircle size={13} />
                  </button>
                ) : null}
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              title={t('common.language')}
              aria-label={t('common.language')}
            >
              <Languages size={13} />
              {lang === 'zh' ? 'EN' : '中文'}
            </Button>
            <Button variant="outline" size="sm" onClick={runScan} disabled={scanning}>
              <RefreshCw size={12} className={cn(scanning && 'animate-spin')} />
              {t('app.scan')}
            </Button>
          </div>
        </header>

        <main
          className={cn(
            'min-w-0 flex-1',
            view.name === 'project' ? 'h-[calc(100vh-56px)] overflow-hidden px-6 py-4' : 'px-6 py-5',
          )}
        >
          {error ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              <AlertTriangle size={14} />
              {error}
            </div>
          ) : null}

          {loading && !data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-[132px] animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30" />
              ))}
            </div>
          ) : view.name === 'settings' ? (
            <SettingsView />
          ) : view.name === 'project' ? (
            selected ? (
              <ProjectDetail
                project={selected}
                busy={busyId === selected.id}
                onBack={() => setView({ name: 'projects' })}
                onAction={act}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                {t('app.projectMissing')}
              </div>
            )
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {FILTERS.map((item) => {
                    const count = counts.get(item) ?? 0;
                    if (item !== 'all' && count === 0) return null;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setFilter(item)}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                          filter === item
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                        )}
                      >
                        {item === 'all' ? t('app.filter.all') : t(kindLabel(item))}
                        <span className="ml-1.5 font-mono text-[10px] opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-zinc-600">
                  <span>{t('app.managed', { count: data?.projects.length ?? 0 })}</span>
                  <span className="text-zinc-800">·</span>
                  <span className={running ? 'text-emerald-400' : 'text-zinc-400'}>
                    {t('app.runningCount', { count: running })}
                  </span>
                  <span className="text-zinc-800">·</span>
                  <span>{t('app.filtered', { count: data?.skipped.length ?? 0 })}</span>
                </div>
              </div>

              {view.name === 'dashboard' ? (
                <Dashboard
                  projects={projects}
                  total={data?.projects.length ?? 0}
                  running={running}
                  runnable={runnable}
                  skipped={data?.skipped.length ?? 0}
                  durationMs={data?.durationMs ?? 0}
                  onOpen={(project) => setView({ name: 'project', id: project.id })}
                  onAction={act}
                  busyId={busyId}
                />
              ) : (
                <ProjectList
                  projects={projects}
                  busyId={busyId}
                  onOpen={(project) => setView({ name: 'project', id: project.id })}
                  onAction={act}
                />
              )}
            </>
          )}
        </main>
      </div>

      <ScanModal
        open={scanOpen}
        report={data}
        scanning={scanning}
        onClose={() => setScanOpen(false)}
        onRescan={runScan}
      />

      {toast ? (
        <div
          className={cn(
            'fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl',
            toast.tone === 'ok'
              ? 'border-emerald-500/25 bg-[#0d1512] text-emerald-300'
              : 'border-red-500/25 bg-[#170d0d] text-red-300',
          )}
        >
          {toast.tone === 'ok' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
