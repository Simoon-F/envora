# Envora

简体中文 | [English](README.md)

Envora 是一个面向运行时、服务和开发者工具链的桌面端本地开发环境管理工具。

它帮助你在一个友好的界面中安装和切换运行时、启动或停止服务、编辑常用配置文件、管理本地域名站点，并把不同语言生态里的常用工具放在触手可及的位置。

> Envora 正在走向开源。项目还很年轻，但方向很明确：让本地开发环境更轻、更可见，也更容易被协作和分享。

## Envora 能做什么

- 在桌面应用中管理本地运行时、服务和开发者工具链。
- 安装和切换支持的运行时版本，并提供清晰的进度和状态反馈。
- 设置默认版本，并将运行时命令暴露到 Shell 环境。
- 启动、停止、重启服务，并查看服务状态。
- 查看和清空服务日志。
- 编辑 `php.ini`、`nginx.conf`、虚拟主机配置和 `my.cnf`。
- 创建 Nginx 虚拟主机，并管理相关的 `/etc/hosts` 记录。
- 管理 MySQL 用户和数据库。
- 安装、更新、配置 Composer，并运行常用 Composer 命令。
- 后续扩展 Rust、Go、npm、pnpm、yarn 等更多工具链。
- 支持浅色、深色和跟随系统主题。

## 为什么做 Envora

本地开发环境经常散落在 Shell 脚本、包管理器、全局服务、隐藏配置文件和旧版本运行时里。时间久了，环境状态会变得难以确认，也不容易迁移或协作。

Envora 希望把这些状态变得清晰可见。它不是要隐藏开发者已经熟悉的工具，而是把关键控制集中到一个地方，同时保留配置文件可编辑、运行时可理解、问题可排查的开发体验。

## 当前状态

Envora 目前处于早期开发阶段。

应用中已经包含 PHP、Nginx、MySQL、Java、Composer、服务控制、配置编辑、虚拟主机和设置等页面，但它还不是一个完全稳定的正式版本。部分能力可能仍然以 macOS 为主，跨平台支持和发布流程也还在继续完善。

如果你愿意尝试，欢迎反馈任何令人困惑的地方。对一个正在走向开源的项目来说，这些反馈很重要。

## 运行时和工具链支持

| 运行时或工具 | 当前支持 |
| --- | --- |
| PHP | macOS 使用 `envora-runtime-packages` Releases 预编译包，Windows 使用官方归档包 |
| Nginx | 下载源码并在本地构建 |
| MySQL | 使用 MySQL Community Server 官方归档包 |
| Java | 使用 Eclipse Temurin / Adoptium API 安装 JDK，并设置 `JAVA_HOME` |
| Node.js | 使用 Node.js 官方二进制归档包，包含 `node`、`npm`、`npx` 和 `corepack` |
| Composer | Envora 托管 Composer，并检测系统 Composer |
| Rust、Go | 计划中 |
| npm、pnpm、yarn | 计划中 |

运行时发布和打包说明见
[docs/release-runtimes.md](docs/release-runtimes.md)。

运行时二进制资产正在拆分到独立仓库：
[`Simoon-F/envora-runtime-packages`](https://github.com/Simoon-F/envora-runtime-packages)。

## 技术栈

- [Tauri 2](https://tauri.app/)：桌面应用外壳和原生能力集成
- [Rust](https://www.rust-lang.org/)：运行时、服务、下载和配置管理
- [React](https://react.dev/) 与 [TypeScript](https://www.typescriptlang.org/)：界面开发
- [Vite](https://vite.dev/)：前端构建工具
- [Tailwind CSS](https://tailwindcss.com/) 和 shadcn 风格 UI 基础组件
- [SWR](https://swr.vercel.app/) 与 [Zustand](https://zustand.docs.pmnd.rs/)：前端数据流和状态管理

## 环境要求

- Node.js
- pnpm
- Rust toolchain
- 当前平台所需的 Tauri 系统依赖

如果你在 macOS 上构建运行时，可能还需要安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

如果需要本地构建 Nginx，请确认系统中已经准备好常见构建工具和依赖库。

## 快速开始

克隆仓库：

```bash
git clone https://github.com/Simoon-F/envora.git
cd envora
```

安装依赖：

```bash
pnpm install
```

启动 Tauri 开发应用：

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

## 项目结构

```text
.
├── src/                  # React 应用
│   ├── components/       # 布局、UI 和运行时详情组件
│   ├── hooks/            # Tauri/SWR 数据 hooks
│   ├── pages/            # Dashboard、运行时、Composer、设置页面
│   ├── stores/           # 前端状态
│   └── types/            # 前端共享类型
├── src-tauri/            # Tauri 和 Rust 后端
│   ├── assets/           # 默认运行时配置模板
│   └── src/
│       ├── commands/     # Tauri 命令处理
│       ├── core/         # 平台工具和共享错误
│       ├── download/     # 下载和解压逻辑
│       ├── runtime/      # PHP、Nginx、MySQL、Java、Node.js provider
│       ├── service/      # 服务生命周期管理
│       ├── state/        # 应用状态和后台任务追踪
│       └── settings/     # 应用设置和路径
└── docs/                 # 项目文档
```

## 参与贡献

欢迎参与贡献。

因为 Envora 还在成型阶段，目前最有帮助的贡献包括：

- 清晰的 Bug 报告，并附上操作系统、芯片架构和复现步骤。
- 对操作流程、交互体验或本地开发能力缺口的反馈。
- 小而聚焦的 Pull Request。
- 运行时打包说明和平台相关修复。
- 文档改进。

如果你准备提交较大的改动，建议先发起 issue 或 discussion，方便我们先对齐方向。

## 开发约定

- 运行时行为应该尽量明确。Envora 应该让本地状态更容易看见，而不是更难理解。
- 长耗时操作应该在页面切换后仍然保持可见、可理解。
- 优先保留可编辑的配置文件，而不是把状态藏在不透明的生成逻辑中。
- 平台差异尽量放在 Rust 层清晰处理。
- 在项目稳定前，避免大范围重写。
- 谨慎处理服务进程、端口、文件系统写入和 Shell 环境修改。

## Roadmap

- 改进跨平台运行时和工具链支持。
- 支持 Rust、Go、npm、pnpm、yarn 以及相关工具。
- 完善发布打包和更新流程。
- 增强下载、构建和服务启动失败时的诊断信息。
- 改善首次使用体验。
- 为运行时 provider 和服务生命周期补充测试。
- 发布稳定安装包。

## License

许可证尚未最终确定。

如果你计划在其他项目中使用 Envora，请等待仓库加入 license 文件，或发起 issue 讨论你的使用场景。

## 致谢

Envora 建立在 Tauri、Rust、React、PHP、Nginx、MySQL、Composer 以及众多开源工具社区的优秀成果之上。
