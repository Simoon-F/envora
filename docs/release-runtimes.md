# 运行时预编译包发布指南

本文档只记录通过 GitHub Actions 构建并发布 Envora 运行时预编译包的流程。

主仓库 `Simoon-F/envora` 负责应用代码、文档和应用版本发布。
运行时二进制包仓库 `Simoon-F/envora-runtime-packages` 负责预编译资产构建和 GitHub Releases 发布。

## 目录结构约定

```text
GitHub Releases 下载 URL 格式：
  https://github.com/Simoon-F/envora-runtime-packages/releases/download/{tag}/{filename}

Tag 格式：
  {runtime}-{version}

示例：
  php-8.4.1

文件命名：
  {runtime}-{version}-macos-{arch}.tar.gz

arch:
  arm64   Apple Silicon
  x86_64  Intel Mac

最终 URL 示例：
  https://github.com/Simoon-F/envora-runtime-packages/releases/download/php-8.4.1/php-8.4.1-macos-arm64.tar.gz
```

这些文件名与 [src-tauri/src/runtime/php.rs](../src-tauri/src/runtime/php.rs) 中的下载 URL 约定一致。

## GitHub Actions 构建

PHP 官方不提供 macOS 二进制包。Envora 的 macOS PHP 包由 `envora-runtime-packages` 仓库中的 GitHub Actions 在 macOS runner 上自动编译并发布。

Workflow 文件：

```text
Simoon-F/envora-runtime-packages/.github/workflows/build-php-macos.yml
```

该 workflow 由二进制包仓库单独维护，主仓库不保留本地手动编译流程。

## 手动触发

以下操作在 `envora-runtime-packages` 仓库中完成：

1. 打开 GitHub 仓库的 Actions 页面。
2. 选择 `Build PHP macOS Runtime`。
3. 点击 `Run workflow`。
4. 输入 PHP 版本号，例如 `8.4.8`。
5. 保持 `publish` 为 `true`。

构建完成后会创建或更新：

```text
Release tag:
  php-{version}

Release assets:
  php-{version}-macos-arm64.tar.gz
  php-{version}-macos-arm64.tar.gz.sha256
  php-{version}-macos-x86_64.tar.gz
  php-{version}-macos-x86_64.tar.gz.sha256
```

## Runner 架构

当前 workflow 使用固定 runner：

| 架构 | Runner |
|------|--------|
| Apple Silicon | `macos-15` |
| Intel | `macos-15-intel` |

不要使用 `macos-latest`，避免 GitHub 调整 latest 指向时构建架构发生变化。

## PHP 包要求

macOS PHP 包至少应包含：

- `php`
- `php-cgi`
- `php-fpm`
- `phpize`
- `php-config`
- `php.ini`
- 常用扩展：`curl`、`gd`、`mbstring`、`mysqli`、`openssl`、`pdo_mysql`、`pdo_sqlite`、`sqlite3`、`zlib`

如果 Composer 报 `requires ext-gd * -> it is missing from your system`，优先修复 `envora-runtime-packages` 的 GitHub Actions 构建配置，并重新发布带 GD 的 PHP 包。

## 发布后更新主仓库

发布完成后，编辑 [src-tauri/src/runtime/php.rs](../src-tauri/src/runtime/php.rs)，在 `PHP_VERSIONS` 中添加新版本：

```rust
const PHP_VERSIONS: &[&str] = &["8.4.8", "8.4.1", "8.3.14", "8.2.26", "8.1.31"];
//                              ^^^^^^^ 新版本放在最前面
```

然后在主仓库中验证：

```bash
pnpm build
cd src-tauri
cargo check
```

## 文件位置对照

| 文件 | 说明 |
|------|------|
| [src-tauri/src/runtime/php.rs](../src-tauri/src/runtime/php.rs) | PHP Provider，含版本列表和下载 URL |
| [src-tauri/src/runtime/mysql.rs](../src-tauri/src/runtime/mysql.rs) | MySQL Provider |
| [src-tauri/src/runtime/nginx.rs](../src-tauri/src/runtime/nginx.rs) | Nginx Provider |
| `~/.envora/runtimes/` | 运行时安装目录 |
| `~/.envora/bin/` | 默认版本软链目录 |
