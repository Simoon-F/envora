<p align="center">
  <img src="public/logo.png" width="120" alt="Envora logo" />
</p>

<h1 align="center">Envora</h1>

<p align="center">
  面向本地开发环境的桌面管理工具，统一管理运行时、服务进程、配置文件和语言工具链。
</p>

<p align="center">
  简体中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.1.11-blue" />
  <img alt="status" src="https://img.shields.io/badge/status-pre--1.0-orange" />
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" />
  <img alt="license" src="https://img.shields.io/badge/license-pending-yellow" />
</p>

Envora 希望把开发者日常需要处理的环境状态集中到一个清晰的界面中：安装运行时版本、切换默认版本、启动或停止服务、编辑常见配置、管理本地域名站点，并让项目工具链保持可见、可控、可排查。

> Envora 正处于积极开发阶段。项目正在以开源方向推进，目标是成为一个稳定、清晰、可协作的本地开发环境管理平台。

## 目录

- [产品定位](#产品定位)
- [核心能力](#核心能力)
- [支持的运行时和工具](#支持的运行时和工具)
- [当前状态](#当前状态)
- [架构概览](#架构概览)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [本地开发](#本地开发)
- [开发原则](#开发原则)
- [路线图](#路线图)
- [参与贡献](#参与贡献)
- [许可证](#许可证)
- [致谢](#致谢)

## 产品定位

现代本地开发环境通常由包管理器、Shell 配置、后台服务、全局命令、隐藏配置文件和项目约定共同组成。它们足够灵活，但时间一长，很多基础问题会变得不容易回答：

- 当前使用的是哪个运行时版本？
- 这个服务读取的是哪一份配置？
- 哪个进程占用了端口？
- Shell 环境到底被写入了什么？
- 另一位开发者能否复现这套环境？

Envora 的定位不是替代命令行，也不是隐藏底层工具，而是把本地环境的关键状态显式呈现出来。它集中管理常见操作，同时保留文件、命令和运行时目录的可检查性。

## 核心能力

### 运行时管理

- 通过可插拔的 provider 体系安装并管理多个运行时版本——当前支持 PHP、Nginx、MySQL、Java、Node.js 和 Go。
- 设置默认运行时版本，并通过 Envora 托管的 `bin` 目录暴露命令。
- 在页面切换后持续追踪安装、下载、构建等长耗时任务。
- 将下载包、解压后的运行时和版本元数据放在可预期的位置。

### 服务运维

- 在仪表盘中启动、停止、重启和查看本地服务。
- 统一查看服务状态、端口和日志。
- 清空日志，并在配置变更后重载服务。
- 通过任务中心展示服务生命周期相关操作。

### 配置和站点

- 编辑 `php.ini`、`nginx.conf`、虚拟主机配置和 `my.cnf` 等常见配置文件。
- 创建和管理 Nginx 虚拟主机。
- 添加或移除相关 `/etc/hosts` 记录。
- 管理 MySQL 用户和数据库。

### 工具链能力

- 安装、更新、配置 Composer，并运行常用 Composer 命令。
- 同时支持 Envora 托管 Composer 和系统 Composer 检测。
- 通过 npm 和 Corepack 管理 Node.js 生态的包管理器入口。
- 配置 Go 环境路径，并提供缓存清理、SDK 修复等维护能力。

### 应用体验

- 支持英文和简体中文界面。
- 支持浅色、深色和跟随系统主题。
- 支持配置数据目录、运行时目录、命令目录和 Shell 环境。
- 基于 Tauri 提供桌面端原生能力集成。

## 支持的运行时和工具

已支持：

- ✅ PHP
- ✅ Nginx
- ✅ MySQL
- ✅ Java
- ✅ Node.js（含 npm、npx、corepack）
- ✅ pnpm、Yarn（通过 Corepack）
- ✅ Go
- ✅ Composer

我们计划加入更多环境的管理。

运行时发布和打包说明见
[docs/release-runtimes.md](docs/release-runtimes.md)。

运行时二进制资产正在拆分到独立仓库：
[`Simoon-F/envora-runtime-packages`](https://github.com/Simoon-F/envora-runtime-packages)。

## 当前状态

Envora 目前仍处于 1.0 之前的开发阶段。

应用已经包含主要运行时、服务控制、配置编辑、虚拟主机、Composer、任务中心和设置等流程的前端页面与后端 provider。部分能力仍然以 macOS 优先，发布打包流程仍在完善，不同平台之间的能力还没有完全对齐。

可以把它视为一个方向明确、正在快速成型的项目，而不是一个已经完成所有稳定性承诺的正式版本。

## 架构概览

Envora 由 React 前端和 Rust/Tauri 后端组成。

```text
.
├── src/                  # React 应用
│   ├── components/       # 布局、UI 基础组件和运行时组件
│   ├── hooks/            # SWR 与 Tauri 数据 hooks
│   ├── i18n/             # 多语言文案与翻译工具
│   ├── pages/            # 仪表盘、运行时、Composer、设置页面
│   ├── stores/           # 前端状态
│   └── types/            # 前端共享类型
├── src-tauri/            # Tauri 桌面壳和 Rust 后端
│   ├── assets/           # 默认配置模板
│   └── src/
│       ├── commands/     # Tauri 命令处理
│       ├── core/         # 平台工具、事件和共享错误
│       ├── download/     # 下载和归档解压
│       ├── runtime/      # 运行时 provider
│       ├── service/      # 服务生命周期管理
│       ├── state/        # 应用状态和任务追踪
│       └── settings/     # 应用设置和托管路径
└── docs/                 # 项目文档
```

## 技术栈

- [Tauri 2](https://tauri.app/)：桌面应用外壳和原生能力集成
- [Rust](https://www.rust-lang.org/)：运行时、服务、下载和文件系统操作
- [React 19](https://react.dev/) 与 [TypeScript](https://www.typescriptlang.org/)：用户界面，路由使用 [React Router](https://reactrouter.com/) v7
- [Vite 7](https://vite.dev/)：前端开发和构建工具
- [Tailwind CSS v4](https://tailwindcss.com/) 配合 [shadcn](https://ui.shadcn.com/) 与 [Base UI](https://base-ui.com/) 基础组件，图标使用 [Lucide](https://lucide.dev/)
- [SWR](https://swr.vercel.app/) 与 [Zustand](https://zustand.docs.pmnd.rs/)：前端数据流和状态管理

## 环境要求

- Node.js 20+
- pnpm 10.30+（仓库通过 `packageManager` 锁定 `pnpm@10.30.2`）
- Rust 工具链（stable）
- 当前操作系统所需的 Tauri 系统依赖

在 macOS 上构建运行时时，可能还需要安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

如果需要在本地构建 Nginx，请确认系统中已经准备好常见编译工具和依赖库。

## 本地开发

克隆仓库：

```bash
git clone https://github.com/Simoon-F/envora.git
cd envora
```

安装依赖：

```bash
pnpm install
```

启动桌面端开发应用：

```bash
pnpm tauri dev
```

构建前端：

```bash
pnpm build
```

构建桌面应用：

```bash
pnpm tauri build
```

## 开发原则

- 让本地状态保持可见。运行时版本、服务状态、Shell 变更和生成文件都应该容易检查。
- 保留标准工作流。Envora 应该补充 Shell、配置文件、包管理器和服务进程，而不是让它们变得不可见。
- 认真对待长耗时任务。下载、构建、安装和服务操作需要展示进度与失败上下文。
- 明确处理平台差异。macOS、Windows 和 Linux 的差异应尽量在 Rust 层清晰表达。
- 谨慎处理文件系统写入、服务进程、端口和 Shell 配置更新。

## 路线图

**已完成**

- 通过可插拔 provider 体系的运行时管理（PHP、Nginx、MySQL、Java、Node.js、Go）。
- 仪表盘内服务生命周期管理（启动、停止、重启、日志）。
- `php.ini`、`nginx.conf`、虚拟主机、`my.cnf` 等配置编辑。
- Composer 工具链管理，支持系统 Composer 检测。
- 中英文双语界面，浅色 / 深色 / 跟随系统主题。

**进行中**

- 提升运行时安装和服务控制的跨平台一致性。
- 完善发布打包和更新流程。
- 增强下载、构建和服务启动失败时的诊断信息。

**计划中**

- 增加 Rust 工具链管理能力。
- 改善首次启动引导和环境健康检查。
- 为运行时 provider 和服务生命周期补充自动化测试。
- 发布稳定安装包。

## 参与贡献

欢迎参与贡献，尤其是：

- 带有操作系统、芯片架构和复现步骤的 Bug 报告。
- 对本地环境管理流程中困惑点的反馈。
- 小而聚焦的 Pull Request。
- 运行时打包改进和平台相关修复。
- 文档更新。

如果准备提交较大的改动，建议先发起 issue 或 discussion，方便在实现前对齐方向。

## 许可证

项目许可证尚未最终确定。

在仓库加入 license 文件之前，Envora 仅用于评估和反馈。如果你希望在其他项目中使用或基于 Envora 进行二次开发，欢迎发起 issue 讨论你的使用场景。

## 致谢

Envora 建立在 Tauri、Rust、React、PHP、Nginx、MySQL、Java、Node.js、Go、Composer 以及众多开源工具社区的优秀成果之上。
