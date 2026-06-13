# Envora

[简体中文](README.zh-CN.md) | English

Envora is a desktop local development environment manager for runtimes,
services, and developer toolchains.

It helps you install and switch runtimes, start or stop services, edit common
configuration files, manage local sites, and keep language-specific tools close
at hand from a single friendly interface.

> This project is moving toward open source. The codebase is still young, but
> the direction is clear: make local development environments lighter, more
> visible, and easier to share.

## What Envora Does

- Manage local runtimes, services, and developer toolchains from a desktop app.
- Install supported runtime versions with progress feedback.
- Set default versions and expose runtime binaries to your shell.
- Start, stop, restart, and inspect service status.
- View and clear service logs.
- Edit `php.ini`, `nginx.conf`, virtual host configs, and `my.cnf`.
- Create Nginx virtual hosts and manage related `/etc/hosts` entries.
- Manage MySQL users and databases.
- Install, update, configure, and run Composer commands.
- Grow toward Node.js, Rust, Go, npm, pnpm, yarn, and other toolchains.
- Switch between light, dark, and system themes.

## Why

Local development environments can become scattered across shell scripts,
package managers, global services, hidden config files, and old runtime
versions. Envora aims to make that state visible and manageable without forcing
developers to give up the tools they already understand.

The goal is not to hide the tools developers already use. The goal is to put
the important controls in one place, keep files editable, and make the local
environment easier to reason about.

## Current Status

Envora is currently in early development.

The app already contains working PHP, Nginx, MySQL, Composer, service,
configuration, virtual host, and settings screens, but the project is not yet a
polished stable release. Some features may be macOS-first, platform support is
still being refined, and release packaging is evolving.

If you try it, please expect sharp edges and report anything confusing. Those
reports are valuable.

## Runtime And Toolchain Support

| Runtime or tool | Current support |
| --- | --- |
| PHP | Prebuilt packages for macOS via the `envora-runtime-packages` releases, official Windows archives |
| Nginx | Source download and local build |
| MySQL | Official MySQL Community Server archives |
| Java | Eclipse Temurin JDKs via the Adoptium API, with `JAVA_HOME` support |
| Composer | Envora-managed Composer plus system Composer detection |
| Node.js, Rust, Go | Planned |
| npm, pnpm, yarn | Planned |

Runtime release packaging notes live in
[docs/release-runtimes.md](docs/release-runtimes.md).

Binary runtime assets are being split into a dedicated repository:
[`Simoon-F/envora-runtime-packages`](https://github.com/Simoon-F/envora-runtime-packages).

## Tech Stack

- [Tauri 2](https://tauri.app/) for the desktop shell and native integration
- [Rust](https://www.rust-lang.org/) for runtime, service, download, and config
  management
- [React](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/)
  for the interface
- [Vite](https://vite.dev/) for frontend tooling
- [Tailwind CSS](https://tailwindcss.com/) and shadcn-style UI primitives
- [SWR](https://swr.vercel.app/) and [Zustand](https://zustand.docs.pmnd.rs/)
  for client-side data flow

## Requirements

- Node.js
- pnpm
- Rust toolchain
- Tauri system dependencies for your platform

For macOS runtime builds, Envora may also need Xcode Command Line Tools:

```bash
xcode-select --install
```

When building Nginx locally, make sure common build tools and libraries are
available on your system.

## Getting Started

Clone the repository:

```bash
git clone https://github.com/Simoon-F/envora.git
cd envora
```

Install dependencies:

```bash
pnpm install
```

Run the Tauri development app:

```bash
pnpm tauri dev
```

Build the frontend:

```bash
pnpm build
```

Build the desktop app:

```bash
pnpm tauri build
```

## Project Structure

```text
.
├── src/                  # React app
│   ├── components/       # Layout, UI, and runtime detail components
│   ├── hooks/            # Tauri/SWR data hooks
│   ├── pages/            # Dashboard, runtimes, Composer, settings
│   ├── stores/           # Client-side state
│   └── types/            # Shared frontend types
├── src-tauri/            # Tauri and Rust backend
│   ├── assets/           # Default runtime config templates
│   └── src/
│       ├── commands/     # Tauri command handlers
│       ├── core/         # Platform helpers and shared errors
│       ├── download/     # Download and extraction logic
│       ├── runtime/      # PHP, Nginx, MySQL, Java providers
│       ├── service/      # Service lifecycle management
│       └── settings/     # App settings and paths
└── docs/                 # Project documentation
```

## Contributing

Contributions are welcome.

Because Envora is still taking shape, the most helpful contributions right now
are:

- Clear bug reports with your operating system, architecture, and reproduction
  steps.
- Feedback about confusing flows or missing local-development features.
- Small, focused pull requests.
- Runtime packaging notes and platform-specific fixes.
- Documentation improvements.

Before opening a larger pull request, please start with an issue or discussion
so we can align on the direction.

## Development Notes

- Keep runtime behavior explicit. Envora should make local state easier to see,
  not harder.
- Prefer editable config files over opaque generated state.
- Keep platform differences visible in the Rust layer.
- Avoid broad rewrites while the app is stabilizing.
- Be careful with service processes, ports, filesystem writes, and shell
  environment changes.

## Roadmap

- Improve cross-platform runtime and toolchain support.
- Add Node.js, Rust, Go, npm, pnpm, yarn, and related tooling.
- Add clearer release packaging and update flows.
- Expand diagnostics for failed downloads, builds, and service starts.
- Improve first-run onboarding.
- Add tests around runtime providers and service lifecycle behavior.
- Publish stable installation packages.

## License

The license has not been finalized yet.

If you plan to use Envora in another project, please wait until a license file
is added or open an issue to discuss your use case.

## Acknowledgements

Envora builds on the excellent work of the Tauri, Rust, React, PHP, Nginx,
MySQL, Composer, and open source tooling communities.
