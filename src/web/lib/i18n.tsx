import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'zh' | 'en';

const zh = {
  'app.tagline': '本机项目总目录',
  'nav.dashboard': '仪表盘',
  'nav.projects': '项目列表',
  'nav.settings': '设置',
  'nav.runningCount': '{count} 运行',
  'nav.scanCenter': '扫描中心',
  'nav.lastScan': '上次扫描 {time}',
  'nav.neverScanned': '还没有扫描',
  'nav.rescan': '重新扫描并查看报告',
  'nav.scanning': '扫描中…',
  'nav.footer': 'v0.0.2 · 仅本机',

  'app.title.dashboard': '仪表盘',
  'app.title.projects': '项目列表',
  'app.title.settings': '设置',
  'app.title.project': '项目详情',
  'app.subtitle.dashboard': '{count} 个项目 · {running} 个运行中',
  'app.subtitle.projects': '启停、查看端口和日志',
  'app.subtitle.settings': '扫描根目录与运行配置',
  'app.search': '搜索项目、技术栈、路径…',
  'app.scan': '扫描',
  'app.filter.all': '全部',
  'app.managed': '{count} 个可管理项目',
  'app.runningCount': '{count} 个运行中',
  'app.filtered': '过滤 {count} 个',
  'app.projectMissing': '项目不存在或已被移除',
  'app.toast.started': '{name} 启动成功',
  'app.toast.stopped': '{name} 停止成功',
  'app.toast.restarted': '{name} 重启成功',
  'app.toast.failed': '{action}失败：{error}',
  'action.start': '启动',
  'action.stop': '停止',
  'action.restart': '重启',
  'action.logs': '日志',

  'dash.total': '项目总数',
  'dash.totalHint': '已收录的可管理项目',
  'dash.running': '运行中',
  'dash.runningHint': '进程存活或端口已监听',
  'dash.runnable': '可一键启动',
  'dash.runnableHint': '有明确启动命令',
  'dash.scanTime': '本次扫描',
  'dash.scanTimeHint': '过滤掉 {count} 个不可运行目录',
  'dash.projects': '项目',
  'dash.projectsHint': '点击卡片查看详情与日志',
  'dash.empty': '没有匹配的项目',
  'dash.emptyHint': '换个关键词，或去设置里加扫描根目录',

  'card.noDescription': '暂无描述',
  'card.noStart': '无需启动',

  'status.running': '运行中',
  'status.stopped': '已停止',
  'status.unknown': '未知',
  'status.na': '无需启动',

  'kind.service': '服务',
  'kind.desktop': '桌面应用',
  'kind.miniapp': '小程序',
  'kind.mobile': '移动端',
  'kind.package': '包 / 组件',
  'kind.docs': '文档',

  'list.project': '项目',
  'list.kind': '类型',
  'list.status': '状态',
  'list.ports': '端口',
  'list.createdAt': '创建时间',
  'list.lastOperation': '最后操作',
  'list.actions': '操作',
  'list.empty': '没有匹配的项目',

  'detail.overview': '概览',
  'detail.terminal': '终端日志',
  'detail.noStartCommand': '没有启动命令',
  'detail.runningIndicator': '进程在运行',
  'detail.runInfo': '运行信息',
  'detail.type': '类型',
  'detail.runtime': '运行时',
  'detail.entry': '启动命令',
  'detail.supervisor': '托管',
  'detail.notRunning': '未运行',
  'detail.port': '端口',
  'detail.createdAt': '创建时间',
  'detail.lastOperation': '最后操作',
  'detail.stack': '技术栈',
  'detail.git': 'Git',
  'detail.branch': '分支',
  'detail.lastCommit': '最后提交',
  'detail.commit': 'commit',
  'detail.notGit': '不是 git 仓库',
  'detail.artifacts': '构建产物',
  'detail.readme': 'README',
  'detail.readmeMissing': '未找到',
  'detail.noReadme': '这个项目还没有 README。',

  'term.autoScroll': '自动滚动',
  'term.clear': '清空',
  'term.streaming': 'streaming',
  'term.disconnected': 'disconnected',
  'term.loading': 'loading…',
  'term.waiting': '等待日志输出…',
  'term.notRunning': '项目未运行。点击上方「启动」后，这里会实时显示 npm run dev 这类命令的输出。',

  'scan.title': '扫描报告',
  'scan.subtitle': '看清扫了哪些目录、用了什么规则、哪些被过滤了',
  'scan.rescan': '重新扫描',
  'scan.collected': '收录项目',
  'scan.filtered': '过滤目录',
  'scan.dirs': '扫描目录',
  'scan.time': '耗时',
  'scan.roots': '扫描根目录',
  'scan.rules': '扫描规则',
  'scan.rule.roots': '扫描根目录：{roots}',
  'scan.rule.depth': '最大深度：{depth} 层',
  'scan.rule.runnable': '只收录「能跑起来」的项目：有启动命令 / 桌面应用 / 小程序 / 移动端 / Docker',
  'scan.rule.skip': '跳过：仅文档、没有启动入口的纯包',
  'scan.rule.descend': '进入已识别项目后不再下钻（plugins/ 例外）',
  'scan.rule.ignore': '忽略目录：{list}',
  'scan.rule.more': ' 等',
  'scan.errors': '扫描错误',
  'scan.filteredDirs': '被过滤的目录（{count}）',
  'scan.path': '路径',
  'scan.reason': '原因',
  'scan.reason.docs-only': '仅文档，没有可启动入口',
  'scan.reason.no-entry': '没有启动命令（纯包 / 组件库）',
  'scan.none': '没有过滤任何目录。',
  'scan.empty': '还没有扫描结果',

  'settings.title': '扫描配置',
  'settings.configFile': '配置文件',
  'settings.listen': '监听地址',
  'settings.maxDepth': '最大深度',
  'settings.includeNonRunnable': '显示不可运行项目',
  'settings.yes': '是',
  'settings.no': '否',
  'settings.roots': '根目录',
  'settings.loading': '加载中…',
  'settings.howToTitle': '怎么加扫描目录',
  'settings.howTo1': '直接编辑上面的配置文件，把目录加进 roots，然后回仪表盘点「重新扫描」。',
  'settings.howTo2': '也可以用命令行临时覆盖：',
  'settings.howTo3': '想连纯文档、组件库也显示出来，加 --all 启动。',

  'common.copy': '复制',
  'common.close': '关闭',
  'common.back': '返回',
  'common.language': '语言',
};

const en: Record<keyof typeof zh, string> = {
  'app.tagline': 'Local project catalog',
  'nav.dashboard': 'Dashboard',
  'nav.projects': 'Projects',
  'nav.settings': 'Settings',
  'nav.runningCount': '{count} live',
  'nav.scanCenter': 'Scan center',
  'nav.lastScan': 'Last scan {time}',
  'nav.neverScanned': 'Not scanned yet',
  'nav.rescan': 'Rescan & view report',
  'nav.scanning': 'Scanning…',
  'nav.footer': 'v0.0.2 · local only',

  'app.title.dashboard': 'Dashboard',
  'app.title.projects': 'Projects',
  'app.title.settings': 'Settings',
  'app.title.project': 'Project',
  'app.subtitle.dashboard': '{count} projects · {running} running',
  'app.subtitle.projects': 'Start, stop, inspect ports and logs',
  'app.subtitle.settings': 'Scan roots and runtime settings',
  'app.search': 'Search projects, stacks, paths…',
  'app.scan': 'Scan',
  'app.filter.all': 'All',
  'app.managed': '{count} managed projects',
  'app.runningCount': '{count} running',
  'app.filtered': '{count} filtered',
  'app.projectMissing': 'Project not found or removed',
  'app.toast.started': '{name} started',
  'app.toast.stopped': '{name} stopped',
  'app.toast.restarted': '{name} restarted',
  'app.toast.failed': '{action} failed: {error}',
  'action.start': 'Start',
  'action.stop': 'Stop',
  'action.restart': 'Restart',
  'action.logs': 'Logs',

  'dash.total': 'Projects',
  'dash.totalHint': 'Indexed managed projects',
  'dash.running': 'Running',
  'dash.runningHint': 'Process alive or port listening',
  'dash.runnable': 'Startable',
  'dash.runnableHint': 'Has a start command',
  'dash.scanTime': 'Scan time',
  'dash.scanTimeHint': '{count} non-runnable folders filtered',
  'dash.projects': 'Projects',
  'dash.projectsHint': 'Click a card for details and logs',
  'dash.empty': 'No matching projects',
  'dash.emptyHint': 'Try another keyword, or add scan roots in Settings',

  'card.noDescription': 'No description',
  'card.noStart': 'No start needed',

  'status.running': 'Running',
  'status.stopped': 'Stopped',
  'status.unknown': 'Unknown',
  'status.na': 'No start',

  'kind.service': 'Service',
  'kind.desktop': 'Desktop app',
  'kind.miniapp': 'Mini program',
  'kind.mobile': 'Mobile',
  'kind.package': 'Package',
  'kind.docs': 'Docs',

  'list.project': 'Project',
  'list.kind': 'Type',
  'list.status': 'Status',
  'list.ports': 'Ports',
  'list.createdAt': 'Created',
  'list.lastOperation': 'Last action',
  'list.actions': 'Actions',
  'list.empty': 'No matching projects',

  'detail.overview': 'Overview',
  'detail.terminal': 'Terminal',
  'detail.noStartCommand': 'No start command',
  'detail.runningIndicator': 'Process running',
  'detail.runInfo': 'Runtime',
  'detail.type': 'Type',
  'detail.runtime': 'Runtime',
  'detail.entry': 'Command',
  'detail.supervisor': 'Supervisor',
  'detail.notRunning': 'Not running',
  'detail.port': 'Ports',
  'detail.createdAt': 'Created',
  'detail.lastOperation': 'Last action',
  'detail.stack': 'Stack',
  'detail.git': 'Git',
  'detail.branch': 'Branch',
  'detail.lastCommit': 'Last commit',
  'detail.commit': 'commit',
  'detail.notGit': 'Not a git repository',
  'detail.artifacts': 'Artifacts',
  'detail.readme': 'README',
  'detail.readmeMissing': 'Not found',
  'detail.noReadme': 'This project has no README yet.',

  'term.autoScroll': 'Auto-scroll',
  'term.clear': 'Clear',
  'term.streaming': 'streaming',
  'term.disconnected': 'disconnected',
  'term.loading': 'loading…',
  'term.waiting': 'Waiting for output…',
  'term.notRunning': 'Project is not running. Start it and the output of commands like npm run dev will stream here.',

  'scan.title': 'Scan report',
  'scan.subtitle': 'What was scanned, which rules applied, and what was filtered',
  'scan.rescan': 'Rescan',
  'scan.collected': 'Indexed',
  'scan.filtered': 'Filtered',
  'scan.dirs': 'Directories',
  'scan.time': 'Duration',
  'scan.roots': 'Scan roots',
  'scan.rules': 'Scan rules',
  'scan.rule.roots': 'Scan roots: {roots}',
  'scan.rule.depth': 'Max depth: {depth} levels',
  'scan.rule.runnable': 'Only index runnable projects: start command, desktop app, mini program, mobile app, or Docker',
  'scan.rule.skip': 'Skip docs-only folders and packages without a start entry',
  'scan.rule.descend': 'Do not descend after a project is detected (except plugins/)',
  'scan.rule.ignore': 'Ignored folders: {list}',
  'scan.rule.more': ' and more',
  'scan.errors': 'Scan errors',
  'scan.filteredDirs': 'Filtered folders ({count})',
  'scan.path': 'Path',
  'scan.reason': 'Reason',
  'scan.reason.docs-only': 'Docs only, no runnable entry',
  'scan.reason.no-entry': 'No start command (package or library)',
  'scan.none': 'Nothing was filtered.',
  'scan.empty': 'No scan result yet',

  'settings.title': 'Scan settings',
  'settings.configFile': 'Config file',
  'settings.listen': 'Listening on',
  'settings.maxDepth': 'Max depth',
  'settings.includeNonRunnable': 'Show non-runnable projects',
  'settings.yes': 'Yes',
  'settings.no': 'No',
  'settings.roots': 'Roots',
  'settings.loading': 'Loading…',
  'settings.howToTitle': 'How to add scan roots',
  'settings.howTo1': 'Edit the config file above, add folders to roots, then rescan from the dashboard.',
  'settings.howTo2': 'Or override from the CLI:',
  'settings.howTo3': 'To include docs-only and package folders, start with --all.',
  'common.copy': 'Copy',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.language': 'Language',
};

const dictionaries = { zh, en } as const;

export type MessageKey = keyof typeof zh;
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = 'projectdeck.lang';

function detectLang(): Lang {
  // ?lang=en / ?lang=zh 可以直接覆盖，方便分享链接和截图
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (fromUrl === 'zh' || fromUrl === 'en') return fromUrl;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {}
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang());

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const t = useCallback<Translate>(
    (key, vars) => {
      let text: string = dictionaries[lang][key] ?? dictionaries.zh[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [lang],
  );

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      toggle: () => setLang(lang === 'zh' ? 'en' : 'zh'),
      t,
    }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
