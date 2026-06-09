# 运行时预编译包发布指南

本文档说明如何编译、打包、上传运行时（PHP/MySQL/Nginx）预编译包到独立的二进制仓库 `Simoon-F/envora-runtime-packages` 的 GitHub Releases。

主仓库 `Simoon-F/envora` 负责应用代码、文档和应用版本发布。
运行时二进制包仓库 `Simoon-F/envora-runtime-packages` 负责预编译资产发布。

## 目录结构约定

```
GitHub Releases 下载 URL 格式：
  https://github.com/Simoon-F/envora-runtime-packages/releases/download/{tag}/{filename}

Tag 格式：  {runtime}-{version}    例：php-8.4.1
文件命名：  {runtime}-{version}-macos-{arch}.tar.gz
  arch: arm64 (Apple Silicon) | x86_64 (Intel)

最终 URL 示例：
  https://github.com/Simoon-F/envora-runtime-packages/releases/download/php-8.4.1/php-8.4.1-macos-arm64.tar.gz
```

## 准备工作

```bash
# 确保 Homebrew 和必要工具已安装
brew install gh          # GitHub CLI（上传用）
brew install pkg-config  # 编译检测用

# GitHub 认证（仅需一次）
gh auth login
```

## 推荐发布流程：GitHub Actions 自动构建 PHP macOS 包

PHP 官方不提供 macOS 二进制包。Envora 的 macOS PHP 包由 GitHub Actions 在 macOS runner 上自动编译并发布到 `envora-runtime-packages`，避免在个人电脑上手动维护二进制。

Workflow 文件：

```
Simoon-F/envora-runtime-packages/.github/workflows/build-php-macos.yml
```

### 手动触发

以下操作在 `envora-runtime-packages` 仓库中完成：

1. 打开 GitHub 仓库的 Actions 页面。
2. 选择 `Build PHP macOS Runtime`。
3. 点击 `Run workflow`。
4. 输入 PHP 版本号，例如 `8.4.8`。
5. 保持 `publish` 为 `true`。

构建完成后会创建或更新：

```
Release tag:
  php-{version}

Release assets:
  php-{version}-macos-arm64.tar.gz
  php-{version}-macos-arm64.tar.gz.sha256
  php-{version}-macos-x86_64.tar.gz
  php-{version}-macos-x86_64.tar.gz.sha256
```

这些文件名与 `src-tauri/src/runtime/php.rs` 中的下载 URL 约定一致。

## Windows PHP 包策略

Windows 直接使用 PHP 官方预编译 zip，不需要 Envora 自己构建。

下载来源：

```
https://windows.php.net/downloads/releases/archives/php-{version}-nts-Win32-vs17-x64.zip
```

选择说明：

| 选项 | Envora 使用 |
|------|-------------|
| 架构 | x64 |
| Thread Safety | Non Thread Safe (NTS) |
| 编译器 | VS17 |
| Web 接入方式 | `php-cgi.exe -b 127.0.0.1:9000` |

Windows 官方 zip 解压后的结构与 macOS 包不同：

```
~/.envora/runtimes/php/{version}/php.exe
~/.envora/runtimes/php/{version}/php-cgi.exe
~/.envora/runtimes/php/{version}/php.ini
~/.envora/runtimes/php/{version}/ext/*.dll
```

macOS 仍使用 Envora 构建包：

```
~/.envora/runtimes/php/{version}/bin/php
~/.envora/runtimes/php/{version}/sbin/php-fpm
~/.envora/runtimes/php/{version}/lib/php.ini
~/.envora/runtimes/php/{version}/lib/php/extensions/*/*.so
```

因此后端代码按平台处理：

| 系统 | 下载来源 | 服务进程 | 配置文件 |
|------|----------|----------|----------|
| macOS | `envora-runtime-packages` GitHub Release | `php-fpm` | `lib/php.ini` |
| Windows | windows.php.net 官方 zip | `php-cgi.exe` | `php.ini` |

### Runner 架构

当前 workflow 使用：

| 架构 | Runner |
|------|--------|
| Apple Silicon | `macos-15` |
| Intel | `macos-15-intel` |

不要使用 `macos-latest`，避免 GitHub 调整 latest 指向时构建架构发生变化。

### 发布新版本后的代码更新

发布完成后，编辑 [src-tauri/src/runtime/php.rs](../src-tauri/src/runtime/php.rs)，在 `PHP_VERSIONS` 中添加新版本：

```rust
const PHP_VERSIONS: &[&str] = &["8.4.8", "8.4.1", "8.3.14", "8.2.26", "8.1.31"];
//                              ^^^^^^^ 新版本放在最前面
```

---

## PHP

以下流程保留为本地排障或临时手动打包参考。常规发布优先使用 GitHub Actions。

### 安装编译依赖

```bash
brew install bison libxml2 oniguruma curl libiconv
```

> ⚠️ `bison` 是 keg-only，系统自带版本太旧（2.3），必须用 Homebrew 的（3.8+）。

### 编译打包

```bash
VERSION="8.4.1"   # ← 修改这里

# 环境设置（所有步骤共用）
SOURCE_DIR="/tmp/php-build-${VERSION}/php-${VERSION}"
INSTALL_DIR="/tmp/php-package/${VERSION}"
BREW_PREFIX="/opt/homebrew"
BREW_OPT="$BREW_PREFIX/opt"

export PATH="$BREW_OPT/bison/bin:$BREW_PREFIX/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export TERM=dumb
export CFLAGS="-I$BREW_PREFIX/include -I$BREW_OPT/libiconv/include"
export CPPFLAGS="-I$BREW_PREFIX/include -I$BREW_OPT/libiconv/include"
export LDFLAGS="-L$BREW_PREFIX/lib -L$BREW_OPT/libiconv/lib"

# pkg-config 路径
PKG_CONFIG_PATH="$BREW_PREFIX/lib/pkgconfig"
for pkg in openssl libxml2 curl oniguruma libiconv sqlite; do
    p="$BREW_OPT/$pkg/lib/pkgconfig"
    [ -d "$p" ] && PKG_CONFIG_PATH="$PKG_CONFIG_PATH:$p"
done
export PKG_CONFIG_PATH

# 1. 下载源码
cd /tmp
curl -fsSL -O "https://www.php.net/distributions/php-${VERSION}.tar.gz"

# 2. 解压
rm -rf "$(dirname "$SOURCE_DIR")"
mkdir -p "$(dirname "$SOURCE_DIR")"
tar -xzf "php-${VERSION}.tar.gz" -C "$(dirname "$SOURCE_DIR")"

# 3. Configure
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

cd "$SOURCE_DIR"
./configure \
    --prefix="$INSTALL_DIR" \
    --with-openssl \
    --with-curl \
    --with-zlib \
    --with-iconv="$BREW_OPT/libiconv" \
    --enable-mbstring \
    --enable-fpm \
    --with-pdo-mysql \
    --with-mysqli \
    --with-libxml

# 4. Make
make -j$(sysctl -n hw.ncpu)

# 5. Make install
make install

# 6. Strip 去符号
for bin in "$INSTALL_DIR/bin/php" "$INSTALL_DIR/bin/php-cgi" "$INSTALL_DIR/sbin/php-fpm"; do
    [ -f "$bin" ] && strip "$bin"
done
for so in "$INSTALL_DIR/lib/php/extensions"/*/*.so; do
    [ -f "$so" ] && strip "$so"
done

# 7. 签名
for bin in "$INSTALL_DIR/bin/php" "$INSTALL_DIR/bin/php-cgi" "$INSTALL_DIR/sbin/php-fpm"; do
    [ -f "$bin" ] && codesign --force --sign - "$bin"
done

# 8. 生成 php.ini
cat > "$INSTALL_DIR/lib/php.ini" << 'PHPINI'
[PHP]
engine = On
short_open_tag = Off
precision = 14
output_buffering = 4096
max_execution_time = 30
max_input_time = 60
memory_limit = 256M
error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT
display_errors = On
display_startup_errors = On
log_errors = On
error_log = ~/.envora/logs/php-error.log
default_charset = "UTF-8"
date.timezone = "Asia/Shanghai"

[mysqlnd]
mysqlnd.collect_statistics = On
mysqlnd.collect_memory_statistics = On

[Session]
session.save_handler = files
session.save_path = "/tmp"

[Assertion]
zend.assertions = 1
PHPINI

# 9. 校验
echo "=== PHP 版本 ==="
"$INSTALL_DIR/bin/php" -v
echo ""
echo "=== 已编译扩展 ==="
"$INSTALL_DIR/bin/php" -m | grep -iE "curl|mbstring|mysql|openssl|pdo"

# 10. 打包
ARCH=$(uname -m)
PACKAGE="/tmp/php-package/php-${VERSION}-macos-${ARCH}.tar.gz"
cd /tmp/php-package
tar -czf "$PACKAGE" "$VERSION"
echo ""
echo "打包完成: $PACKAGE"
ls -lh "$PACKAGE"
du -sh "$INSTALL_DIR"
```

### 上传到 GitHub Releases

```bash
VERSION="8.4.1"
ARCH=$(uname -m)
PACKAGE="/tmp/php-package/php-${VERSION}-macos-${ARCH}.tar.gz"

gh release create "php-${VERSION}" "$PACKAGE" \
    --title "PHP ${VERSION} (macOS ${ARCH})" \
    --notes "Pre-compiled PHP ${VERSION} for macOS ${ARCH}.

Includes: php, php-cgi, php-fpm, phpize, php-config

Built on macOS $(sw_vers -productVersion) with Xcode CLT."
```

### 更新代码中的版本列表

编辑 [src-tauri/src/runtime/php.rs](src-tauri/src/runtime/php.rs)，在 `PHP_VERSIONS` 中添加新版本：

```rust
const PHP_VERSIONS: &[&str] = &["8.4.2", "8.4.1", "8.3.14", "8.2.26", "8.1.31"];
//                              ^^^^^^^ 新版本放在最前面
```

---

## MySQL

> MySQL 使用官方预编译包，无需本地编译。MVP 阶段直接下载官方 tar.gz，解压后初始化即可。

### 下载来源

```
macOS arm64:
  https://dev.mysql.com/get/Downloads/MySQL-{version}/mysql-{version}-macos14-arm64.tar.gz

macOS x86_64:
  https://dev.mysql.com/get/Downloads/MySQL-{version}/mysql-{version}-macos14-x86_64.tar.gz
```

> ⚠️ MySQL 预编译包体积较大（~400MB），不适合上传到 GitHub Releases。
> 当前策略：App 内直接从 MySQL 官方下载（已有 DownloadManager 支持）。

### 后续如需自定义构建

如果未来需要加入自定义编译选项（如启用某些存储引擎），参考 PHP 流程编译后上传到 `envora-runtime-packages` 的 GitHub Releases：

```bash
# Tag: mysql-{version}
# File: mysql-{version}-macos-{arch}.tar.gz
# URL:  https://github.com/Simoon-F/envora-runtime-packages/releases/download/mysql-8.0.36/mysql-8.0.36-macos-arm64.tar.gz
```

---

## Nginx

> MVP 阶段 Nginx 保留源码编译（依赖少：只需 pcre/zlib）。如需预编译，参考以下流程。

### 安装编译依赖

```bash
brew install pcre2 openssl zlib
```

### 编译打包

```bash
VERSION="1.26.0"
SOURCE_DIR="/tmp/nginx-build/nginx-${VERSION}"
INSTALL_DIR="/tmp/nginx-package/${VERSION}"
BREW_PREFIX="/opt/homebrew"

export TERM=dumb
export PATH="$BREW_PREFIX/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# 下载 & 解压
curl -fsSL -O "https://nginx.org/download/nginx-${VERSION}.tar.gz"
rm -rf "$(dirname "$SOURCE_DIR")"
mkdir -p "$(dirname "$SOURCE_DIR")"
tar -xzf "nginx-${VERSION}.tar.gz" -C "$(dirname "$SOURCE_DIR")"

# Configure & Make
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$SOURCE_DIR"
./configure \
    --prefix="$INSTALL_DIR" \
    --with-http_ssl_module \
    --with-http_v2_module \
    --with-pcre \
    --with-zlib="$BREW_PREFIX/opt/zlib"

make -j$(sysctl -n hw.ncpu)
make install

# Strip & Sign
strip "$INSTALL_DIR/sbin/nginx"
codesign --force --sign - "$INSTALL_DIR/sbin/nginx"

# 打包
ARCH=$(uname -m)
PACKAGE="/tmp/nginx-package/nginx-${VERSION}-macos-${ARCH}.tar.gz"
cd /tmp/nginx-package
tar -czf "$PACKAGE" "$VERSION"

# 上传
gh release create "nginx-${VERSION}" "$PACKAGE" \
    --title "Nginx ${VERSION} (macOS ${ARCH})" \
    --notes "Pre-compiled Nginx ${VERSION} for macOS ${ARCH}."
```

### 更新代码

编辑 [src-tauri/src/runtime/nginx.rs](src-tauri/src/runtime/nginx.rs)，添加版本。

---

## x86_64 (Intel Mac) 构建

如果你用的是 Apple Silicon Mac，要为 Intel Mac 构建预编译包：

```bash
# 在编译命令前加上 arch 前缀
arch -x86_64 ./configure --prefix="$INSTALL_DIR" ...
arch -x86_64 make -j$(sysctl -n hw.ncpu)
arch -x86_64 make install

# 打包时文件名使用 x86_64
tar -czf "php-${VERSION}-macos-x86_64.tar.gz" "$VERSION"
```

> ⚠️ 交叉编译需要安装 Rosetta 2 和对应的 x86_64 依赖库，推荐在 CI (GitHub Actions) 上分别用不同 runner 构建。

---

## GitHub Actions CI 自动构建

已实现：见 `Simoon-F/envora-runtime-packages` 仓库中的
[`build-php-macos.yml`](https://github.com/Simoon-F/envora-runtime-packages/blob/master/.github/workflows/build-php-macos.yml)。

该 workflow 已经从主仓库拆分出去，由二进制包仓库单独负责运行时资产构建和发布。

CI 会先在 macOS arm64 和 x86_64 runner 上分别构建包，再由单独的 `publish` job 汇总 artifact 并上传到同一个 GitHub Release，避免两个构建 job 同时创建 Release。

---

## 文件位置对照

| 文件 | 说明 |
|------|------|
| [src-tauri/src/runtime/php.rs](../src-tauri/src/runtime/php.rs) | PHP Provider（含版本列表和下载 URL） |
| [src-tauri/src/runtime/mysql.rs](../src-tauri/src/runtime/mysql.rs) | MySQL Provider |
| [src-tauri/src/runtime/nginx.rs](../src-tauri/src/runtime/nginx.rs) | Nginx Provider |
| `~/.envora/runtimes/` | 运行时安装目录 |
| `~/.envora/bin/` | 默认版本软链目录 |
