export type ProjectKind = 'service' | 'desktop' | 'miniapp' | 'mobile' | 'package' | 'docs';

export type Runtime = 'node' | 'python' | 'go' | 'rust' | 'java' | 'swift' | 'android' | 'none';

export type ProjectStatus = 'running' | 'stopped' | 'unknown' | 'n/a';

export type Supervisor = 'pm2' | 'docker' | 'external' | 'none';

export interface PortInfo {
  port: number;
  source: 'config' | 'env' | 'script' | 'default';
  open: boolean;
  /** 监听该端口的进程工作目录，用于判断端口到底属于哪个项目 */
  owner?: string;
}

export interface GitInfo {
  branch: string;
  dirty: number;
  lastCommit: string;
  lastDate: string;
  remote: string;
}

export interface Artifact {
  type: string;
  name: string;
  version?: string;
}

export interface Entry {
  cmd: string;
  args: string[];
  cwd: string;
  source: 'detected' | 'manifest';
}

export interface Project {
  id: string;
  name: string;
  path: string;
  kind: ProjectKind;
  runtime: Runtime;
  stack: string[];
  description: string;
  version?: string;
  entry?: Entry;
  ports: PortInfo[];
  status: ProjectStatus;
  supervisor: Supervisor;
  git?: GitInfo;
  artifacts: Artifact[];
  tags: string[];
  readmeFile?: string;
  createdAt: string;
  runnable: boolean;
  lastOperation?: string;
  startedAt?: string;
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
