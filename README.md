# Envora

[简体中文](README.zh-CN.md) | English

Envora is a desktop development environment manager for local runtimes,
services, configuration files, and language toolchains.

It gives developers one place to install runtime versions, switch defaults,
manage service processes, edit common configuration files, and keep project
tooling visible without replacing the command-line workflows they already use.

> Envora is under active development. The project is being shaped in the open
> toward a stable local development environment platform.

## Product Positioning

Modern local development environments are often assembled from package
managers, shell profiles, background services, global binaries, hidden config
files, and project-specific conventions. That works, but over time it becomes
hard to answer basic questions:

- Which runtime version is active?
- Where is this service reading its configuration from?
- Which process owns this port?
- What changed in my shell environment?
- Can another developer reproduce this setup?

Envora is designed to make that state explicit. It centralizes the operational
surface of a local environment while keeping the underlying files, commands,
and runtime directories inspectable.

## Core Capabilities

### Runtime Management

- Install and manage multiple versions of PHP, Nginx, MySQL, Java, Node.js, and
  Go.
- Set default runtime versions and expose runtime commands through Envora's
  managed `bin` directory.
- Track install progress and long-running operations across navigation.
- Keep downloaded packages, extracted runtimes, and runtime metadata in
  predictable locations.

### Service Operations

- Start, stop, restart, and inspect local services from the dashboard.
- View service status, ports, and logs in one place.
- Clear logs and reload services after configuration changes.
- Keep service lifecycle work visible through the operation center.

### Configuration And Sites

- Edit common configuration files, including `php.ini`, `nginx.conf`, virtual
  host files, and `my.cnf`.
- Create and manage Nginx virtual hosts.
- Add or remove related `/etc/hosts` entries.
- Manage MySQL users and databases.

### Toolchain Utilities

- Install, update, configure, and run Composer commands.
- Detect Envora-managed Composer and system Composer.
- Manage Node.js package-manager entry points through npm and Corepack.
- Configure Go environment paths and maintenance tasks.

### Application Experience

- Bilingual interface: English and Simplified Chinese.
- Light, dark, and system appearance modes.
- Settings for data, runtime, command, and shell environment paths.
- Desktop integration through Tauri.

## Supported Runtimes And Tools

| Runtime or tool | Current behavior |
| --- | --- |
| PHP | macOS packages from `envora-runtime-packages`; Windows packages from official archives |
| Nginx | Source download and local build flow |
| MySQL | MySQL Community Server archive installation |
| Java | Eclipse Temurin JDK discovery and installation through the Adoptium API, with `JAVA_HOME` support |
| Node.js | Official Node.js binary archives, including `node`, `npm`, `npx`, and `corepack` |
| npm | Follows the selected Node.js runtime |
| pnpm, Yarn | Managed through Corepack where available |
| Go | Stable Go archives from the official Go release index, with `GOROOT`, `GOPATH`, cache, and tooling support |
| Composer | Envora-managed Composer installation plus system Composer detection |
| Rust | Planned |

Runtime release and packaging notes are documented in
[docs/release-runtimes.md](docs/release-runtimes.md).

Runtime binary assets are being separated into
[`Simoon-F/envora-runtime-packages`](https://github.com/Simoon-F/envora-runtime-packages).

## Current Status

Envora is currently pre-1.0 software.

The application contains working screens and backend providers for the main
runtime, service, configuration, virtual host, Composer, operation, and settings
flows. Some capabilities are still macOS-first, packaging is still evolving,
and platform parity is not yet complete.

Use it with that expectation: the direction is stable, but the implementation
surface is still being refined.

## Architecture

Envora is split into a React frontend and a Rust/Tauri backend.

```text
.
├── src/                  # React application
│   ├── components/       # Layout, UI primitives, runtime components
│   ├── hooks/            # SWR and Tauri data hooks
│   ├── i18n/             # Locale files and translation helpers
│   ├── pages/            # Dashboard, runtimes, Composer, settings
│   ├── stores/           # Client-side state
│   └── types/            # Shared frontend types
├── src-tauri/            # Tauri desktop shell and Rust backend
│   ├── assets/           # Default config templates
│   └── src/
│       ├── commands/     # Tauri command handlers
│       ├── core/         # Platform helpers, events, and shared errors
│       ├── download/     # Download and archive extraction
│       ├── runtime/      # Runtime providers
│       ├── service/      # Service lifecycle management
│       ├── state/        # App state and operation tracking
│       └── settings/     # App settings and managed paths
└── docs/                 # Project documentation
```

## Technology Stack

- [Tauri 2](https://tauri.app/) for the desktop shell and native integration
- [Rust](https://www.rust-lang.org/) for runtime, service, download, and
  filesystem operations
- [React](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/)
  for the user interface
- [Vite](https://vite.dev/) for frontend development and builds
- [Tailwind CSS](https://tailwindcss.com/) with shadcn-style UI primitives
- [SWR](https://swr.vercel.app/) and [Zustand](https://zustand.docs.pmnd.rs/)
  for client-side data flow and state

## Requirements

- Node.js
- pnpm 10+
- Rust toolchain
- Tauri system dependencies for your operating system

On macOS, runtime builds may also require Xcode Command Line Tools:

```bash
xcode-select --install
```

When building Nginx locally, make sure common compiler tools and libraries are
available on the system.

## Development

Clone the repository:

```bash
git clone https://github.com/Simoon-F/envora.git
cd envora
```

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development mode:

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

## Development Principles

- Keep local state visible. Runtime versions, service status, shell changes,
  and generated files should be easy to inspect.
- Preserve standard workflows. Envora should complement shells, config files,
  package managers, and service processes rather than obscure them.
- Treat long-running work as first-class. Downloads, builds, installs, and
  service operations should expose progress and failure context.
- Keep platform behavior explicit. macOS, Windows, and Linux differences should
  be handled deliberately in the Rust layer.
- Be conservative with filesystem writes, service processes, ports, and shell
  profile updates.

## Roadmap

- Improve cross-platform parity for runtime installation and service control.
- Complete release packaging and update flows.
- Expand diagnostics for failed downloads, builds, and service starts.
- Add Rust toolchain management.
- Improve first-run onboarding and environment health checks.
- Add automated tests around runtime providers and service lifecycle behavior.
- Publish stable installation packages.

## Contributing

Contributions are welcome, especially:

- Reproducible bug reports with operating system, architecture, and steps.
- Feedback about confusing environment-management workflows.
- Small, focused pull requests.
- Runtime packaging improvements and platform-specific fixes.
- Documentation updates.

For larger changes, please open an issue or discussion first so the direction
can be aligned before implementation.

## License

The project license has not been finalized.

Please wait for a license file before using Envora in another project, or open
an issue to discuss your intended use.

## Acknowledgements

Envora builds on the work of the Tauri, Rust, React, PHP, Nginx, MySQL, Java,
Node.js, Go, Composer, and open source tooling communities.
