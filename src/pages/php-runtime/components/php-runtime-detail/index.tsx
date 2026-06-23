import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Download, Trash2, Check, Save, PackagePlus, Circle } from 'lucide-react';
import { useInstalledVersions, useAvailableVersions, useDefaultVersion, useInstallVersion, useUninstallVersion, useSwitchDefault } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import type { RuntimeVersion, VersionInfo } from '@/types/runtime';
import { tauriInvoke } from '@/lib/tauri';

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
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {message && <span className="text-green-500">{message}</span>}
          {isModified && !message && <span className="text-yellow-500">{t('Common', 'UnsavedChanges')}</span>}
        </span>
        <Button size="sm" onClick={handleSave} disabled={saving || !isModified}>
          <Save className="h-3 w-3 mr-1" />
          {saving ? t('Common', 'Saving') : t('Common', 'Save')}
        </Button>
      </div>
      <textarea
        className="w-full h-96 font-mono text-xs bg-muted p-3 rounded-md border resize-y"
        value={content || ''}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};

// ═══════════ Extension Manager ═══════════

const ExtensionManager = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

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

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const builtins = new Set([
    'Core', 'ctype', 'curl', 'date', 'dom', 'fileinfo', 'filter', 'hash',
    'iconv', 'json', 'libxml', 'mbstring', 'mysqli', 'mysqlnd', 'openssl',
    'pcre', 'PDO', 'pdo_mysql', 'pdo_sqlite', 'Phar', 'posix', 'random',
    'Reflection', 'session', 'SimpleXML', 'SPL', 'sqlite3', 'standard',
    'tokenizer', 'xml', 'xmlreader', 'xmlwriter', 'zlib',
  ]);
  const loadable = extensions.filter((e) => !builtins.has(e.name));
  const builtinsList = extensions.filter((e) => builtins.has(e.name));

  return (
    <div className="space-y-4">
      {/* Loadable extensions */}
      <div>
        <h4 className="text-sm font-medium mb-2">{t('RuntimeDetail', 'LoadableExtensions')}</h4>
        <div className="grid grid-cols-2 gap-1">
          {loadable.map((ext) => (
            <div key={ext.filename} className="flex items-center justify-between p-2 rounded-md border text-sm">
              <div className="flex items-center gap-2">
                <Switch
                  checked={ext.enabled}
                  onCheckedChange={() => handleToggle(ext)}
                  disabled={toggling === ext.filename}
                />
                <span>{ext.name}</span>
                {toggling === ext.filename && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <span className="text-xs text-muted-foreground">{ext.size}</span>
            </div>
          ))}
          {loadable.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-2">{t('RuntimeDetail', 'NoLoadableExtensions')}</p>
          )}
        </div>
      </div>

      {/* Built-in extensions (read-only) */}
      <div>
        <h4 className="text-sm font-medium mb-2">{t('RuntimeDetail', 'BuiltInExtensions')}</h4>
        <div className="grid grid-cols-3 gap-1">
          {builtinsList.map((ext) => (
            <div key={ext.name} className="flex items-center gap-1 text-xs text-muted-foreground p-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {ext.name}
            </div>
          ))}
        </div>
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
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : installed && installed.length > 0 ? (
        <div className="space-y-2">
          {installed.map((v: RuntimeVersion) => (
            <div key={v.version} className="flex items-center justify-between p-3 rounded-md border">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{v.version}</span>
                {v.version === defaultVersion && (
                  <Badge><Check className="h-3 w-3 mr-1" />{t('Common', 'Default')}</Badge>
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
                  <Trash2 className="h-3 w-3" />
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
            className="flex items-center justify-between p-2 rounded-md border hover:bg-muted cursor-pointer mb-1"
            onClick={() => handleInstall(v.version)}
          >
            <span className="font-mono text-sm">{v.version}</span>
            <Button size="sm" variant="ghost" disabled={isInstalling}>
              <Download className="h-3 w-3" />
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

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('RuntimeDetail', 'PeclDescription')}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {extensions.map((ext) => (
          <div key={ext.name} className="flex items-center justify-between p-3 rounded-md border">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{ext.name}</span>
                {ext.installed && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Circle className="h-2 w-2 fill-green-600" /> {t('Common', 'Installed')}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{ext.description}</p>
            </div>
            <Button
              size="sm"
              variant={ext.installed ? "ghost" : "outline"}
              disabled={ext.installed || installing !== null}
              onClick={() => handleInstall(ext.name)}
            >
              {installing === ext.name ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <PackagePlus className="h-3 w-3 mr-1" />
              )}
              {ext.installed ? t('Common', 'Installed') : t('Common', 'Install')}
            </Button>
          </div>
        ))}
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
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🐘</span>
        <h1 className="text-2xl font-bold">PHP</h1>
        {defaultVer && <Badge variant="outline">{t('Common', 'DefaultValue', { value: defaultVer })}</Badge>}
      </div>

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
