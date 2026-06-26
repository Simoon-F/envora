import { useState, useEffect, useCallback } from 'react';
import { Switch } from '@/components/ui/switch';
import { Loader2, PackagePlus, Circle, Package } from 'lucide-react';
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

const ExtensionManager = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setExtensions(await tauriInvoke<ExtensionInfo[]>('list_php_extensions', { version })); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [version]);
  useEffect(() => { load(); }, [load]);

  const handleToggle = async (ext: ExtensionInfo) => {
    setToggling(ext.filename);
    try { await tauriInvoke('toggle_php_extension', { version, extensionName: ext.filename, enabled: !ext.enabled }); setExtensions(prev => prev.map(e => e.filename === ext.filename ? { ...e, enabled: !e.enabled } : e)); }
    catch (e) { console.error(e); }
    finally { setToggling(null); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  const builtins = new Set(['Core', 'ctype', 'curl', 'date', 'dom', 'fileinfo', 'filter', 'hash', 'iconv', 'json', 'libxml', 'mbstring', 'mysqli', 'mysqlnd', 'openssl', 'pcre', 'PDO', 'pdo_mysql', 'pdo_sqlite', 'Phar', 'posix', 'random', 'Reflection', 'session', 'SimpleXML', 'SPL', 'sqlite3', 'standard', 'tokenizer', 'xml', 'xmlreader', 'xmlwriter', 'zlib']);
  const loadable = extensions.filter(e => !builtins.has(e.name));
  const builtinsList = extensions.filter(e => builtins.has(e.name));

  return (
    <div className="space-y-5">
      <div>
        <h4 className="mb-2 text-sm font-medium">{t('RuntimeDetail', 'LoadableExtensions')} ({loadable.length})</h4>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {loadable.map(ext => (
            <div key={ext.filename} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Switch checked={ext.enabled} onCheckedChange={() => handleToggle(ext)} disabled={toggling === ext.filename} />
                <span>{ext.name}</span>
                {toggling === ext.filename && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{ext.size}</span>
            </div>
          ))}
          {loadable.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2">{t('RuntimeDetail', 'NoLoadableExtensions')}</p>}
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium">{t('RuntimeDetail', 'BuiltInExtensions')} ({builtinsList.length})</h4>
        <div className="grid grid-cols-3 gap-1.5">
          {builtinsList.map(ext => (
            <div key={ext.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" />
              {ext.name}
            </div>
          ))}
        </div>
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

  const load = useCallback(async () => {
    setLoading(true);
    try { setExtensions(await tauriInvoke<PeclInfo[]>('list_pecl_extensions', { version })); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [version]);
  useEffect(() => { load(); }, [load]);

  const handleInstall = async (name: string) => {
    setInstalling(name); setError(null);
    try { await tauriInvoke('install_pecl_extension', { version, extensionName: name }); await load(); }
    catch (e) { setError(t('Common', 'ErrorPrefix', { message: String(e) })); }
    finally { setInstalling(null); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger whitespace-pre-wrap">{error}</div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {extensions.map(ext => (
          <PeclCard key={ext.name} ext={ext} installing={installing} onInstall={handleInstall} />
        ))}
      </div>
    </div>
  );
};

const PeclCard = ({ ext, installing, onInstall }: { ext: PeclInfo; installing: string | null; onInstall: (name: string) => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{ext.name}</span>
          {ext.installed && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Circle className="size-2 fill-success" />
              {t('Common', 'Installed')}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{ext.description}</p>
      </div>
      <button
        type="button"
        disabled={ext.installed || installing !== null}
        onClick={() => onInstall(ext.name)}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
      >
        {installing === ext.name ? <Loader2 className="size-3.5 animate-spin" /> : <PackagePlus className="size-3.5" />}
        {ext.installed ? t('Common', 'Installed') : t('Common', 'Install')}
      </button>
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
