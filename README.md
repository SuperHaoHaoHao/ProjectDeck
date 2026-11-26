# ProjectDeck

> 给「被 AI 批量生产出来的本地项目」做一个总目录 + 总开关。

[English](#english) · [llms.txt](./llms.txt)

用 AI 写代码之后，本机项目会越来越多：Web 服务、Electron 桌面端、uni-app 小程序、macOS App、Android、组件库、纯文档…… ProjectDeck 扫描你的本地目录，把它们变成一个你能真正用的控制台：

**有哪些、是什么、在哪、怎么启动、现在是否在跑、日志在说什么。**

## 解决什么问题

| 问题 | ProjectDeck 的做法 |
| --- | --- |
| 想不起来本机有哪些项目 | 自动扫描多个根目录，支持嵌套仓库和 monorepo |
| 看到目录名想不起是干嘛的 | 自动识别技术栈，渲染 README，显示版本、路径、git 状态 |
| 启动要翻终端、记命令、记端口 | 浏览器里一键启动 / 停止 / 重启 |
| 不知道报没报错 | 实时日志终端（SSE + ANSI 颜色） |
| 端口通了就以为项目在跑 | 核对监听进程的 cwd，别的项目占着端口不会被误判 |

## 功能（v0.0.2）

- **零配置扫描**：默认扫 `~/Code`，可配置根目录、深度、忽略列表
- **只收录能跑的项目**：纯文档、没有启动入口的包会被过滤，并在扫描报告里给出原因
- **扫描报告**：根目录、规则、扫描目录数、过滤明细、错误、耗时一目了然
- **后台式布局**：左侧栏 + 仪表盘 + 项目列表 + 项目详情
- **一键启停**：识别 `npm run dev`、`python3 app.py`、`go run .` 等启动入口
- **实时日志终端**：ANSI 颜色、自动滚动、暂停、清空；停止后仍可回看
- **项目列表**：状态、端口、创建时间、最后操作、启停按钮
- **详情页**：概览（技术栈 / 端口 / git / 产物 / README）+ 终端日志
- **URL 直达**：`#/dashboard`、`#/projects`、`#/project/:id`、`#/settings`

## 快速开始

```bash
npm install
npm run build
npm start
# 打开 http://127.0.0.1:4321
```

开发模式：

```bash
npm run dev
# API 4321，前端 5310（Vite HMR，/api 自动代理）
```

命令行参数：

```bash
projectdeck --root ~/Code --root ~/Work --port 4400 --no-open
projectdeck --all    # 连纯文档、组件库也显示
```

## 扫描规则

1. 从每个根目录开始向下遍历，最多 `maxDepth` 层
2. 识别 marker：`package.json`、`manifest.json` + `pages.json`、`*.xcodeproj`、`Package.swift`、`AndroidManifest.xml`、`go.mod`、`Cargo.toml`、`pom.xml`、`requirements.txt`、`pyproject.toml`、`compose.yaml`
3. 只收录「能跑起来」的项目：有启动命令，或属于桌面应用 / 小程序 / 移动端
4. 跳过 `node_modules`、`.git`、`dist`、`build`、`uni_modules`、`sdk`、`HBuilder-*`、`Android-SDK*`、`examples` 等
5. 识别为项目后不再下钻，`plugins/` 例外（KimiCodePulse 这类插件项目）

## 启停与日志

- 启动命令来自项目识别结果，例如 `npm run dev`、`python3 app.py`、`go run .`
- 每个项目跑在独立进程组里，停止时整棵进程树一起退出（npm → vite → node）
- stdout/stderr 会进入环形缓冲、写入 `~/.projectdeck/logs/<id>.log`，并通过 SSE 实时推到页面
- 「运行中」不是只看端口通不通，而是核对监听进程的 cwd 是否属于该项目

## 配置

`~/.projectdeck/config.json`

```json
{
  "port": 4321,
  "host": "127.0.0.1",
  "roots": ["/Users/you/Code"],
  "maxDepth": 6,
  "ignore": ["my-vendor-dir"]
}
```

运行态：`~/.projectdeck/runtime.json`
日志：`~/.projectdeck/logs/<project-id>.log`

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects` | 项目列表（含运行态） |
| POST | `/api/scan` | 重新扫描并返回报告 |
| GET | `/api/projects/:id` | 项目详情 + README |
| POST | `/api/projects/:id/start` | 启动 |
| POST | `/api/projects/:id/stop` | 停止 |
| POST | `/api/projects/:id/restart` | 重启 |
| GET | `/api/projects/:id/logs` | 最近日志 |
| GET | `/api/projects/:id/logs/stream` | SSE 实时日志 |
| GET | `/api/runtime` | 运行态列表 |
| GET | `/api/config` | 当前配置 |

## 给 AI Agent 看

仓库根目录有 [`llms.txt`](./llms.txt)，包含项目定位、能力、API、状态和关键词，方便 agent 快速理解这个项目。

MCP server（stdio + HTTP）在 v0.1 路线里：让 Claude Code / Kimi / Codex 直接查询项目、拉日志、启停服务。

## Roadmap

| 版本 | 内容 |
| --- | --- |
| v0.1 | MCP server、GitHub 克隆接入、手动接入、pm2 驱动 |
| v0.2 | FRP 只读面板、Docker 驱动、launchd 只读 |
| v0.3 | 「收养」外部进程、历史指标、项目笔记与标签 |
| v1.0 | 配方市场、Tauri 桌面端、多机管理 |

## 设计文档

立项与完整设计：[`../docs/ideas/2026-11-26-本机项目管理平台-立项.md`](../docs/ideas/2026-11-26-本机项目管理平台-立项.md)

## License

MIT

---

## English

ProjectDeck is a local-first project catalog and control deck for developers who accumulate dozens of AI-generated repositories. It auto-discovers runnable projects under your dev folders, detects their stack, renders READMEs, tracks ports and git state, and lets you start/stop them with live streaming logs — all in one local web UI. No database, no cloud, macOS-first.

Quick start: `npm install && npm run build && npm start`, then open http://127.0.0.1:4321.

Machine-readable summary for agents: [`llms.txt`](./llms.txt).
