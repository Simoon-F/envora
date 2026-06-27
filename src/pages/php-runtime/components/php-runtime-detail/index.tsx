import { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2,
  Download,
  Trash2,
  Check,
  Save,
  PackagePlus,
  Circle,
  Package,
  Shield,
  Zap,
  Search,
  GitBranch,
  Cpu,
  Database,
  Globe,
  Lock,
  Code2,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useInstalledVersions, useAvailableVersions, useDefaultVersion, useInstallVersion, useUninstallVersion, useSwitchDefault } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import type { RuntimeVersion, VersionInfo } from '@/types/runtime';
import { tauriInvoke } from '@/lib/tauri';
import { RuntimeHeader } from '@/components/runtime/runtime-header';
import { PhpIcon } from '@/components/runtime/runtime-icons';
import { EmptyState } from '@/components/runtime/empty-state';
import { cn } from '@/lib/utils';

interface ExtensionInfo {
  name: string;
  filename: string;
  enabled: boolean;
  size: string;
}

// ═══════════ Config Editor ═══════════

const PhpIniEditor = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadConfig();
  }, [version]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const text = await tauriInvoke<string>('get_php_config', { version });
      setContent(text);
      setOriginal(text);
    } catch (e) {
      setContent(`; ${t('Common', 'SaveFailed', { message: String(e) })}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!content) return;
    setSaving(true);
    setMessage('');
    try {
      await tauriInvoke('save_php_config', { version, content });
      setOriginal(content);
      setMessage(t('Common', 'Saved'));
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      setMessage(t('Common', 'SaveFailed', { message: String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const isModified = content !== original;

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {message && <span className="text-success">{message}</span>}
          {isModified && !message && <span className="text-warning">{t('Common', 'UnsavedChanges')}</span>}
        </span>
        <Button size="sm" onClick={handleSave} disabled={saving || !isModified}>
          <Save className="size-3.5 mr-1" />
          {saving ? t('Common', 'Saving') : t('Common', 'Save')}
        </Button>
      </div>
      <textarea
        className="w-full h-96 font-mono text-xs bg-code-bg p-3 rounded-lg border border-border resize-y"
        value={content || ''}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};

// ═══════════ Extension Helper Types ═══════════

const EXT_CATEGORIES: Record<string, { icon: React.ReactNode; label: string }> = {
  curl: { icon: <Globe className="size-3.5" />, label: '网络' },
  gd: { icon: <Sparkles className="size-3.5" />, label: '图像处理' },
  mbstring: { icon: <Code2 className="size-3.5" />, label: '字符串' },
  mysqlnd: { icon: <Database className="size-3.5" />, label: '数据库' },
  mysqli: { icon: <Database className="size-3.5" />, label: '数据库' },
  pdo_mysql: { icon: <Database className="size-3.5" />, label: '数据库' },
  pdo_sqlite: { icon: <Database className="size-3.5" />, label: '数据库' },
  sqlite3: { icon: <Database className="size-3.5" />, label: '数据库' },
  openssl: { icon: <Lock className="size-3.5" />, label: '安全' },
  bcmath: { icon: <Cpu className="size-3.5" />, label: '数学' },
  gmp: { icon: <Cpu className="size-3.5" />, label: '数学' },
  intl: { icon: <Globe className="size-3.5" />, label: '国际化' },
  zip: { icon: <GitBranch className="size-3.5" />, label: '压缩' },
  zlib: { icon: <GitBranch className="size-3.5" />, label: '压缩' },
  session: { icon: <Zap className="size-3.5" />, label: '核心' },
  json: { icon: <Code2 className="size-3.5" />, label: '数据格式' },
  xml: { icon: <Code2 className="size-3.5" />, label: '数据格式' },
  dom: { icon: <Code2 className="size-3.5" />, label: '数据格式' },
  hash: { icon: <Shield className="size-3.5" />, label: '加密' },
  sodium: { icon: <Shield className="size-3.5" />, label: '加密' },
  imagick: { icon: <Sparkles className="size-3.5" />, label: '图像处理' },
  xdebug: { icon: <Zap className="size-3.5" />, label: '调试' },
  redis: { icon: <Database className="size-3.5" />, label: '缓存' },
  memcached: { icon: <Database className="size-3.5" />, label: '缓存' },
  opcache: { icon: <Zap className="size-3.5" />, label: '性能' },
  soap: { icon: <Globe className="size-3.5" />, label: 'Web服务' },
};

const getCategory = (name: string) => EXT_CATEGORIES[name?.toLowerCase()] ?? null;

// ═══════════ Extension Manager ═══════════

const ExtensionManager = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showBuiltins, setShowBuiltins] = useState(false);

  const loadExtensions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await tauriInvoke<ExtensionInfo[]>('list_php_extensions', { version });
      setExtensions(list);
    } catch (e) {
      console.error('Failed to load extensions:', e);
    } finally {
      setLoading(false);
    }
  }, [version]);

  useEffect(() => {
    loadExtensions();
  }, [loadExtensions]);

  const handleToggle = async (ext: ExtensionInfo) => {
    setToggling(ext.filename);
    try {
      await tauriInvoke('toggle_php_extension', {
        version,
        extensionName: ext.filename,
        enabled: !ext.enabled,
      });
      setExtensions((prev) =>
        prev.map((e) => (e.filename === ext.filename ? { ...e, enabled: !e.enabled } : e))
      );
    } catch (e) {
      console.error('Failed to toggle extension:', e);
    } finally {
      setToggling(null);
    }
  };

  const builtins = new Set([
    'Core', 'ctype', 'curl', 'date', 'dom', 'fileinfo', 'filter', 'hash',
    'iconv', 'json', 'libxml', 'mbstring', 'mysqli', 'mysqlnd', 'openssl',
    'pcre', 'PDO', 'pdo_mysql', 'pdo_sqlite', 'Phar', 'posix', 'random',
    'Reflection', 'session', 'SimpleXML', 'SPL', 'sqlite3', 'standard',
    'tokenizer', 'xml', 'xmlreader', 'xmlwriter', 'zlib',
  ]);
  const loadable = extensions.filter((e) => !builtins.has(e.name));
  const builtinsList = extensions.filter((e) => builtins.has(e.name));

  // Filter by search
  const filteredLoadable = useMemo(() => {
    if (!search.trim()) return loadable;
    const q = search.toLowerCase();
    return loadable.filter(
      (e) => e.name.toLowerCase().includes(q) || e.filename.toLowerCase().includes(q)
    );
  }, [loadable, search]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Loadable extensions section */}
      <div>
        {/* Header with count and search */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <PackagePlus className="size-4 text-primary" />
            <h4 className="text-sm font-medium">{t('RuntimeDetail', 'LoadableExtensions')}</h4>
            <Badge variant="outline" className="h-5 px-1.5 text-xs tabular-nums">
              {filteredLoadable.length}
            </Badge>
          </div>
          {filteredLoadable.length > 4 && (
            <div className="relative w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索扩展…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 text-xs pl-7 bg-muted/50"
              />
            </div>
          )}
        </div>

        {/* Extension cards */}
        {filteredLoadable.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredLoadable.map((ext) => {
              const cat = getCategory(ext.name);
              return (
                <div
                  key={ext.filename}
                  className={cn(
                    'group flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 transition-all duration-150',
                    ext.enabled
                      ? 'border-primary/20 bg-primary/3 hover:border-primary/40'
                      : 'border-border hover:border-muted-foreground/30 hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Status indicator */}
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                        ext.enabled
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground/60 group-hover:text-muted-foreground'
                      )}
                    >
                      {ext.enabled ? (
                        <Eye className="size-3.5" />
                      ) : (
                        <EyeOff className="size-3.5" />
                      )}
                    </div>

                    {/* Extension info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{ext.name}</span>
                        {cat && (
                          <TooltipProvider delay={300}>
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="shrink-0 text-[10px] leading-none rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 cursor-default">
                                  {cat.label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{cat.label}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{ext.size}</span>
                    </div>
                  </div>

                  {/* Toggle switch */}
                  <Switch
                    checked={ext.enabled}
                    onCheckedChange={() => handleToggle(ext)}
                    disabled={toggling === ext.filename}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Search className="size-4" />}
            title={search ? '未找到匹配项' : t('RuntimeDetail', 'NoLoadableExtensions')}
            className="py-6"
          />
        )}
      </div>

      {/* Built-in extensions section */}
      <div>
        <button
          type="button"
          onClick={() => setShowBuiltins(!showBuiltins)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <Shield className="size-4" />
          {t('RuntimeDetail', 'BuiltInExtensions')}
          <Badge variant="outline" className="h-5 px-1.5 text-xs tabular-nums">
            {builtinsList.length}
          </Badge>
          <svg
            className={cn('size-3.5 transition-transform', showBuiltins && 'rotate-180')}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showBuiltins && (
          <div className="flex flex-wrap gap-1.5">
            {builtinsList.map((ext) => (
              <Badge
                key={ext.name}
                variant="success"
                className="gap-1 px-2 py-0.5 text-[11px]"
              >
                <Circle className="size-2 fill-success" />
                {ext.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════ Version Tab ═══════════

const VersionsTab = () => {
  const { t } = useTranslation();
  const { data: installed, isLoading, mutate } = useInstalledVersions('php');
  const { data: available } = useAvailableVersions('php');
  const { data: defaultVersion } = useDefaultVersion('php');
  const { mutate: installVersion, isLoading: isInstalling } = useInstallVersion();
  const { mutate: uninstallVersion } = useUninstallVersion();
  const { mutate: switchDefault } = useSwitchDefault();
  const [installProgress, setInstallProgress] = useState<number | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [installingVer, setInstallingVer] = useState<string | null>(null);

  // Subscribe to progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ payload: { runtime: string; version: string; percent: number; message: string } }>(
        'envora://progress',
        (event) => {
          const p = event.payload.payload || event.payload;
          if (p.runtime === 'php' && p.version === installingVer) {
            setInstallProgress(p.percent);
            setInstallMessage(p.message);
          }
        }
      ).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [installingVer]);

  const handleInstall = async (version: string) => {
    setInstallingVer(version);
    setInstallProgress(0);
    try {
      await installVersion({ runtime: 'php', version });
      mutate();
    } finally {
      setInstallingVer(null);
      setInstallProgress(null);
    }
  };

  const handleUninstall = async (version: string) => {
    await uninstallVersion({ runtime: 'php', version });
    mutate();
  };

  return (
    <div className="space-y-4">
      {/* Installed versions */}
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : installed && installed.length > 0 ? (
        <div className="space-y-2">
          {installed.map((v: RuntimeVersion) => (
            <div key={v.version} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{v.version}</span>
                {v.version === defaultVersion && (
                  <Badge><Check className="size-3.5 mr-1" />{t('Common', 'Default')}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formatBytes(v.size)}</span>
                {v.version !== defaultVersion && (
                  <Button variant="ghost" size="sm" onClick={async () => { await switchDefault({ runtime: 'php', version: v.version }); mutate(); }}>
                    {t('Common', 'SetDefault')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleUninstall(v.version)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'NoVersionsInstalled')}</p>
      )}

      {/* Install progress */}
      {installProgress !== null && (
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${installProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {installMessage} ({installProgress.toFixed(0)}%)
          </p>
        </div>
      )}

      {/* Available versions */}
      <div>
        <h4 className="text-sm font-medium mb-2">{t('RuntimeDetail', 'AvailableVersions')}</h4>
        {available?.filter((v: VersionInfo) => !v.is_installed).map((v: VersionInfo) => (
          <div
            key={v.version}
            className="flex items-center justify-between p-2 rounded-lg border border-border bg-card hover:bg-muted cursor-pointer mb-1"
            onClick={() => handleInstall(v.version)}
          >
            <span className="font-mono text-sm">{v.version}</span>
            <Button size="sm" variant="ghost" disabled={isInstalling}>
              <Download className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════ PECL Installer ═══════════

interface PeclInfo {
  name: string;
  description: string;
  installed: boolean;
}

const PeclInstaller = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<PeclInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await tauriInvoke<PeclInfo[]>('list_pecl_extensions', { version });
      setExtensions(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [version]);

  useEffect(() => { load(); }, [load]);

  const handleInstall = async (name: string) => {
    setInstalling(name);
    setError(null);
    try {
      await tauriInvoke('install_pecl_extension', { version, extensionName: name });
      await load();
    } catch (e) {
      setError(t('Common', 'SaveFailed', { message: `${name}: ${String(e)}` }));
    } finally {
      setInstalling(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return extensions;
    const q = search.toLowerCase();
    return extensions.filter(
      (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    );
  }, [extensions, search]);

  const installed = filtered.filter((e) => e.installed);
  const available = filtered.filter((e) => !e.installed);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger whitespace-pre-wrap">
          <svg className="size-4 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
        <PackagePlus className="size-4 shrink-0 mt-0.5 text-primary" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('RuntimeDetail', 'PeclDescription')}
        </p>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="搜索 PECL 扩展…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs pl-8"
        />
      </div>

      {/* Installed PECL extensions */}
      {installed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Check className="size-3.5 text-success" />
            <span className="text-xs font-medium text-muted-foreground">已安装 ({installed.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {installed.map((ext) => (
              <Badge
                key={ext.name}
                variant="success"
                className="gap-1 px-2 py-0.5 text-[11px] cursor-default"
              >
                {ext.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Available PECL extensions */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <PackagePlus className="size-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">可安装 ({available.length})</span>
        </div>
        {available.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {available.map((ext) => (
              <div
                key={ext.name}
                className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-all duration-150 hover:border-primary/30 hover:bg-primary/2 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Package className="size-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    <span className="font-mono text-sm font-medium">{ext.name}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {ext.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!installing}
                  onClick={() => handleInstall(ext.name)}
                  className={cn(
                    'shrink-0 h-7 text-xs gap-1',
                    !!installing && 'opacity-50'
                  )}
                >
                  {installing === ext.name ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>安装中</span>
                    </>
                  ) : (
                    <>
                      <Download className="size-3.5" />
                      <span>安装</span>
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        ) : available.length === 0 && installed.length === 0 && !error ? (
          <EmptyState
            icon={<Search className="size-4" />}
            title={search ? '未找到匹配项' : t('RuntimeDetail', 'NoLoadableExtensions')}
            className="py-6"
          />
        ) : (
          <p className="text-xs text-muted-foreground">{t('RuntimeDetail', 'AllAvailableInstalled')}</p>
        )}
      </div>
    </div>
  );
};

// ═══════════ Main Page ═══════════

export const PhpRuntimeDetail = () => {
  const { t } = useTranslation();
  const { data: installed } = useInstalledVersions('php');
  const { data: defaultVersion } = useDefaultVersion('php');
  const [activeTab, setActiveTab] = useState('versions');

  const defaultVer = defaultVersion || installed?.[0]?.version || '';
  const phpIniPath = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
    ? `~/.envora/runtimes/php/${defaultVer || '{version}'}/php.ini`
    : `~/.envora/runtimes/php/${defaultVer || '{version}'}/lib/php.ini`;

  return (
    <div className="p-5 space-y-3">
      <RuntimeHeader
        icon={<PhpIcon className="size-9" />}
        name="PHP"
        version={defaultVer}
        actions={defaultVer ? <Badge variant="outline">{t('Common', 'DefaultValue', { value: defaultVer })}</Badge> : undefined}
      />

      {/* Version selector */}
      {defaultVer && (
        <div className="text-sm text-muted-foreground">
          {t('RuntimeDetail', 'PhpConfigEditing', { runtime: `PHP ${defaultVer}` })}
          {installed && installed.length > 1 && (
            <span className="ml-2 text-xs">
              {t('RuntimeDetail', 'PhpConfigEditingHint', { count: installed.length })}
            </span>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="versions">{t('Common', 'Versions')}</TabsTrigger>
          <TabsTrigger value="ini" disabled={!defaultVer}>php.ini</TabsTrigger>
          <TabsTrigger value="extensions" disabled={!defaultVer}>{t('Common', 'Extensions')}</TabsTrigger>
          <TabsTrigger value="pecl" disabled={!defaultVer}>PECL</TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('Common', 'InstalledVersions')}</CardTitle></CardHeader>
            <CardContent><VersionsTab /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ini" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                php.ini
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  {phpIniPath}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {defaultVer ? (
                <PhpIniEditor key={defaultVer} version={defaultVer} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'PhpRequired')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extensions" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('Common', 'Extensions')}</CardTitle></CardHeader>
            <CardContent>
              {defaultVer ? (
                <ExtensionManager key={defaultVer} version={defaultVer} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'PhpRequired')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pecl" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('RuntimeDetail', 'InstallPeclExtensions')}</CardTitle></CardHeader>
            <CardContent>
              {defaultVer ? (
                <PeclInstaller key={defaultVer} version={defaultVer} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'PhpRequired')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
