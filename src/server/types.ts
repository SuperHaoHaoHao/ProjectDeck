export type ProjectKind = 'service' | 'desktop' | 'miniapp' | 'mobile' | 'package' | 'docs';

export type Runtime = 'node' | 'python' | 'go' | 'rust' | 'java' | 'swift' | 'android' | 'none';

export type ProjectStatus = 'running' | 'stopped' | 'error' | 'unknown' | 'n/a';

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

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'none';

export interface DependencyState {
  manager: PackageManager;
  /** 有依赖清单（package.json / requirements.txt） */
  hasManifest: boolean;
  /** 依赖看起来已经装好（node_modules / venv 存在） */
  installed: boolean;
  /** 可以一键执行的安装命令；只会是已知包管理器的固定参数 */
  installCmd?: Entry;
}

/** 启动失败归类。服务端只回 code，文案由前端翻译 */
export type FailureCode =
  | 'port-in-use'
  | 'missing-deps'
  | 'missing-script'
  | 'missing-runtime'
  | 'permission'
  | 'unknown';

export interface RunFailure {
  code: FailureCode;
  /** 触发判断的原始日志行，便于用户排查 */
  line: string;
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
  dependencies: DependencyState;
  createdAt: string;
  runnable: boolean;
  lastOperation?: string;
  startedAt?: string;
  /** 最近一次启动失败的归类，来自运行态 */
  failure?: RunFailure;
  /** 是否由 ProjectDeck 启动（外部启动的进程读不到 stdout） */
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
