import { Activity, Boxes, PlayCircle, ScanSearch } from 'lucide-react';
import type { Project } from '@/api';
import { useI18n } from '@/lib/i18n';
import { ProjectCard } from './ProjectCard';

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Boxes;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${tone}`}>
          <Icon size={13} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">{value}</div>
      <div className="mt-0.5 text-[11px] text-zinc-600">{hint}</div>
    </div>
  );
}

export function Dashboard({
  projects,
  total,
  running,
  runnable,
  skipped,
  durationMs,
  onOpen,
  onAction,
  busyId,
}: {
  projects: Project[];
  total: number;
  running: number;
  runnable: number;
  skipped: number;
  durationMs: number;
  onOpen: (project: Project) => void;
  onAction?: (project: Project, action: 'start' | 'stop') => void;
  busyId?: string;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t('dash.total')}
          value={total}
          hint={t('dash.totalHint')}
          icon={Boxes}
          tone="border-zinc-700 bg-zinc-800/60 text-zinc-300"
        />
        <Stat
          label={t('dash.running')}
          value={running}
          hint={t('dash.runningHint')}
          icon={Activity}
          tone="border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
        />
        <Stat
          label={t('dash.runnable')}
          value={runnable}
          hint={t('dash.runnableHint')}
          icon={PlayCircle}
          tone="border-sky-500/25 bg-sky-500/10 text-sky-300"
        />
        <Stat
          label={t('dash.scanTime')}
          value={`${durationMs}ms`}
          hint={t('dash.scanTimeHint', { count: skipped })}
          icon={ScanSearch}
          tone="border-violet-500/25 bg-violet-500/10 text-violet-300"
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300">{t('dash.projects')}</h2>
          <span className="text-[11px] text-zinc-600">{t('dash.projectsHint')}</span>
        </div>
        {projects.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={onOpen}
                onAction={onAction}
                busy={busyId === project.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20 text-center">
            <p className="text-sm text-zinc-400">{t('dash.empty')}</p>
            <p className="mt-1 text-xs text-zinc-600">{t('dash.emptyHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
