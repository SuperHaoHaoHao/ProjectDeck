export type ProjectKind = 'service' | 'desktop' | 'miniapp' | 'mobile' | 'package' | 'docs';
export type ProjectStatus = 'running' | 'stopped' | 'error' | 'unknown' | 'n/a';

export type FailureCode =
  | 'port-in-use'
  | 'missing-deps'
  | 'missing-script'
  | 'missing-runtime'
  | 'permission'
  | 'unknown';

export interface RunFailure {
  code: FailureCode;
  line: string;
}

export interface DependencyState {
  manager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'none';
  hasManifest: boolean;
  installed: boolean;
  installCmd?: { cmd: string; args: string[]; cwd: string; source: string };
}

export interface PortInfo {
  port: number;
  source: string;
  open: boolean;
  owner?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  kind: ProjectKind;
  runtime: string;
  stack: string[];
  description: string;
  version?: string;
  entry?: { cmd: string; args: string[]; cwd: string; source: string };
  ports: PortInfo[];
  status: ProjectStatus;
  supervisor: string;
  git?: {
    branch: string;
    dirty: number;
    lastCommit: string;
    lastDate: string;
    remote: string;
  };
  artifacts: { type: string; name: string; version?: string }[];
  tags: string[];
  readmeFile?: string;
  dependencies: DependencyState;
  createdAt: string;
  runnable: boolean;
  lastOperation?: string;
  startedAt?: string;
  failure?: RunFailure;
  /** true = 由 ProjectDeck 启动，可以看实时日志 */
  managed?: boolean;
  lastSeenAt: string;
}

export type SkipReason = 'docs-only' | 'no-entry';

export interface SkippedItem {
  path: string;
  name: string;
  kind: string;
  reason: SkipReason;
}

export interface ScanResult {
  projects: Project[];
  roots: string[];
  scannedAt: string;
  durationMs: number;
  scannedDirs: number;
  maxDepth: number;
  ignore: string[];
  skipped: SkippedItem[];
  errors: string[];
}

export interface RuntimeState {
  id: string;
  status: 'running' | 'stopped' | 'error';
  pid?: number;
  command?: string;
  kind?: 'run' | 'install';
  startedAt?: string;
  stoppedAt?: string;
  lastOperation?: string;
  exitCode?: number | null;
  error?: string;
  failure?: RunFailure;
}

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function fetchProjects(): Promise<ScanResult> {
  return json<ScanResult>('/api/projects');
}

export function rescan(): Promise<ScanResult> {
  return json<ScanResult>('/api/scan', { method: 'POST' });
}

export function fetchProject(
  id: string,
): Promise<{ project: Project; readme: string; runtime: RuntimeState }> {
  return json(`/api/projects/${id}`);
}

export interface ActionResult {
  ok: boolean;
  runtime: RuntimeState;
  failure?: RunFailure;
}

export function startProject(id: string): Promise<ActionResult> {
  return json(`/api/projects/${id}/start`, { method: 'POST' });
}

export function stopProject(id: string): Promise<ActionResult> {
  return json(`/api/projects/${id}/stop`, { method: 'POST' });
}

export function restartProject(id: string): Promise<ActionResult> {
  return json(`/api/projects/${id}/restart`, { method: 'POST' });
}

export function installProject(id: string): Promise<ActionResult> {
  return json(`/api/projects/${id}/install`, { method: 'POST' });
}

export function fetchLogs(
  id: string,
  lines = 600,
): Promise<{ id: string; lines: string; runtime: RuntimeState }> {
  return json(`/api/projects/${id}/logs?lines=${lines}`);
}

export function logStreamUrl(id: string): string {
  return `/api/projects/${id}/logs/stream`;
}

export function fetchConfig(): Promise<{
  roots: string[];
  port: number;
  host: string;
  maxDepth: number;
  includeNonRunnable: boolean;
  configPath: string;
}> {
  return json('/api/config');
}
