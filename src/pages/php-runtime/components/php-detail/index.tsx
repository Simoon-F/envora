import { useState, useEffect, useCallback, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2,
  PackagePlus,
  Circle,
  Package,
  Search,
  Eye,
  EyeOff,
  Shield,
  Database,
  Globe,
  Lock,
  Zap,
  Code2,
  Sparkles,
  GitBranch,
  Cpu,
  Download,
  Check,
} from 'lucide-react';
import {
  useInstalledVersions,
  useAvailableVersions,
  useDefaultVersion,
  useStartRuntimeInstall,
  useUninstallVersion,
  useSwitchDefault,
} from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { useOperationsStore } from '@/stores/operations';
import type { RuntimeVersion, VersionInfo } from '@/types/runtime';
import { tauriInvoke } from '@/lib/tauri';
import { VersionRow } from '@/components/runtime/version-row';
import { InstallableVersionRow } from '@/components/runtime/installable-version-row';
import { ProgressBlock } from '@/components/runtime/progress-block';
import { ConfigEditor } from '@/components/runtime/config-editor';
import { DetailTabs } from '@/components/runtime/detail-tabs';
import { EmptyState } from '@/components/runtime/empty-state';
import { cn } from '@/lib/utils';

interface ExtensionInfo { name: string; filename: string; enabled: boolean; size: string; }
interface PeclInfo { name: string; description: string; installed: boolean; }

// ── Versions Tab ───────────────────────────────────────────────────

const VersionsTab = () => {
  const { t } = useTranslation();
  const { data: installed, isLoading, mutate } = useInstalledVersions('php');
  const { data: available, mutate: mutateAvailable } = useAvailableVersions('php');
  const { data: defaultVersion, mutate: mutateDefault } = useDefaultVersion('php');
  const { mutate: startInstall } = useStartRuntimeInstall();
  const { mutate: uninstallVersion } = useUninstallVersion();
  const { mutate: switchDefault } = useSwitchDefault();
  const operations = useOperationsStore((state) => state.operations);
  const upsertOperation = useOperationsStore((state) => state.upsert);
  const removeOperation = useOperationsStore((state) => state.remove);
  const phpOperations = Object.values(operations)
    .filter((operation) => operation.kind === 'runtime_install' && operation.target.runtime === 'php')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const runningOperation = phpOperations.find((operation) => operation.status === 'running' || operation.status === 'queued');
  const visibleOperation = runningOperation || phpOperations[0];
  const isInstalling = Boolean(runningOperation);

  const refresh = async () => {
    await Promise.all([mutate(), mutateAvailable(), mutateDefault()]);
  };

  useEffect(() => {
    if (visibleOperation?.status === 'completed') {
      void refresh();
    }
  }, [visibleOperation?.id, visibleOperation?.status]);

  const handleInstall = async (version: string) => {
    const operation = await startInstall({ runtime: 'php', version });
    upsertOperation(operation);
  };

  const installable = (available ?? []).filter((v: VersionInfo) => !v.is_installed);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {installed && installed.length > 0 ? (
        <div className="space-y-2">
          {installed.map((v: RuntimeVersion) => (
            <VersionRow
              key={v.version}
              label={v.version}
              size={v.size}
              isDefault={v.version === defaultVersion}
              onSetDefault={
                v.version !== defaultVersion
                  ? async () => {
                      await switchDefault({ runtime: 'php', version: v.version });
                      mutate();
                    }
                  : undefined
              }
              onUninstall={async () => {
                await uninstallVersion({ runtime: 'php', version: v.version });
                mutate();
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="size-5" />}
          title={t('RuntimeDetail', 'NoVersionsInstalled')}
        />
      )}

      {visibleOperation && (
        <ProgressBlock
          label={`PHP ${visibleOperation.target.version}`}
          message={visibleOperation.message}
          error={visibleOperation.error}
          percent={visibleOperation.percent}
          status={visibleOperation.status}
          onClear={() => removeOperation(visibleOperation.id)}
        />
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium">{t('RuntimeDetail', 'AvailableVersions')}</h4>
        <div className="space-y-1.5">
          {installable.map((v: VersionInfo) => (
            <InstallableVersionRow
              key={v.version}
              label={v.version}
              isInstalling={isInstalling}
              isThisInstalling={runningOperation?.target.version === v.version}
              onInstall={() => handleInstall(v.version)}
            />
          ))}
          {installable.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'AllAvailableInstalled')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── php.ini Editor ─────────────────────────────────────────────────

const PhpIniEditor = ({ version }: { version: string }) => (
  <ConfigEditor version={version} loadCommand="get_php_config" saveCommand="save_php_config" />
);

// ── Extensions ─────────────────────────────────────────────────────

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

const ExtensionManager = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showBuiltins, setShowBuiltins] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setExtensions(await tauriInvoke<ExtensionInfo[]>('list_php_extensions', { version }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [version]);
  useEffect(() => { load(); }, [load]);

  const handleToggle = async (ext: ExtensionInfo) => {
    setToggling(ext.filename);
    try {
      await tauriInvoke('toggle_php_extension', { version, extensionName: ext.filename, enabled: !ext.enabled });
      setExtensions(prev => prev.map(e => e.filename === ext.filename ? { ...e, enabled: !e.enabled } : e));
    } catch (e) {
      console.error(e);
    } finally {
      setToggling(null);
    }
  };

  const builtins = new Set(['Core', 'ctype', 'curl', 'date', 'dom', 'fileinfo', 'filter', 'hash', 'iconv', 'json', 'libxml', 'mbstring', 'mysqli', 'mysqlnd', 'openssl', 'pcre', 'PDO', 'pdo_mysql', 'pdo_sqlite', 'Phar', 'posix', 'random', 'Reflection', 'session', 'SimpleXML', 'SPL', 'sqlite3', 'standard', 'tokenizer', 'xml', 'xmlreader', 'xmlwriter', 'zlib']);
  const loadable = extensions.filter(e => !builtins.has(e.name));
  const builtinsList = extensions.filter(e => builtins.has(e.name));

  const filtered = useMemo(() => {
    if (!search.trim()) return loadable;
    const q = search.toLowerCase();
    return loadable.filter(e => e.name.toLowerCase().includes(q) || e.filename.toLowerCase().includes(q));
  }, [loadable, search]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      {/* Loadable extensions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <PackagePlus className="size-4 text-primary" />
            <h4 className="text-sm font-medium">{t('RuntimeDetail', 'LoadableExtensions')}</h4>
            <Badge variant="outline" className="h-5 px-1.5 text-xs tabular-nums">
              {filtered.length}
            </Badge>
          </div>
          {filtered.length > 4 && (
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

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((ext) => {
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
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                        ext.enabled
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground/60 group-hover:text-muted-foreground'
                      )}
                    >
                      {ext.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </div>
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

      {/* Built-in extensions */}
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

// ── PECL ───────────────────────────────────────────────────────────

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
      setExtensions(await tauriInvoke<PeclInfo[]>('list_pecl_extensions', { version }));
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
      setError(t('Common', 'ErrorPrefix', { message: String(e) }));
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

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

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

      {/* Installed */}
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

      {/* Available */}
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
                <button
                  type="button"
                  disabled={!!installing}
                  onClick={() => handleInstall(ext.name)}
                  className="shrink-0 inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition-all hover:border-primary/30 hover:bg-primary/2 disabled:opacity-50"
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
                </button>
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


// ── Main Component ─────────────────────────────────────────────────

export const PHPDetail = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('versions');

  const tabs = [
    { value: 'versions', label: t('Common', 'Versions'), title: t('Common', 'Versions'), content: <VersionsTab /> },
    { value: 'ini', label: 'php.ini', title: 'php.ini', content: <PhpIniEditor key={version} version={version} /> },
    { value: 'extensions', label: t('Common', 'Extensions'), title: t('Common', 'Extensions'), content: <ExtensionManager key={version} version={version} /> },
    { value: 'pecl', label: 'PECL', title: `PECL ${t('Common', 'Extensions')}`, content: <PeclInstaller key={version} version={version} /> },
  ];

  return <DetailTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} />;
};
