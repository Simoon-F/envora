import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, HardDrive, Loader2, Package, PackageCheck, RefreshCcw, Save, ShieldCheck, Terminal, Trash2, Wrench } from 'lucide-react';
import {
  useAvailableVersions,
  useClearGoCache,
  useDefaultVersion,
  useGoCacheStatus,
  useGoEnvStatus,
  useGoToolsStatus,
  useInstallGoTool,
  useInstalledVersions,
  useRepairGoSdk,
  useStartRuntimeInstall,
  useSwitchDefault,
  useUninstallVersion,
  useUpdateGoEnv,
} from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { useOperationsStore } from '@/stores/operations';
import type { GoEnvUpdate, RuntimeVersion, VersionInfo } from '@/types/runtime';
import { VersionRow } from '@/components/runtime/version-row';
import { InstallableVersionRow } from '@/components/runtime/installable-version-row';
import { ProgressBlock } from '@/components/runtime/progress-block';
import { DetailTabs } from '@/components/runtime/detail-tabs';
import { EmptyState } from '@/components/runtime/empty-state';

const GoVersionsTab = () => {
  const { t } = useTranslation();
  const { data: installed, isLoading, mutate } = useInstalledVersions('go');
  const { data: available, mutate: mutateAvailable } = useAvailableVersions('go');
  const { data: defaultVersion, mutate: mutateDefault } = useDefaultVersion('go');
  const { mutate: startInstall } = useStartRuntimeInstall();
  const { mutate: uninstallVersion } = useUninstallVersion();
  const { mutate: switchDefault } = useSwitchDefault();
  const operations = useOperationsStore((state) => state.operations);
  const upsertOperation = useOperationsStore((state) => state.upsert);
  const removeOperation = useOperationsStore((state) => state.remove);
  const [actionError, setActionError] = useState<string | null>(null);

  const goOperations = Object.values(operations)
    .filter((operation) => operation.kind === 'runtime_install' && operation.target.runtime === 'go')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const runningOperation = goOperations.find((operation) => operation.status === 'running' || operation.status === 'queued');
  const visibleOperation = runningOperation || goOperations[0];
  const isInstalling = Boolean(runningOperation);

  const refresh = async () => {
    await Promise.all([mutate(), mutateAvailable(), mutateDefault()]);
  };

  const handleInstall = async (version: string) => {
    setActionError(null);
    try {
      const operation = await startInstall({ runtime: 'go', version });
      upsertOperation(operation);
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleUninstall = async (version: string) => {
    setActionError(null);
    try {
      await uninstallVersion({ runtime: 'go', version });
      await refresh();
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleSwitchDefault = async (version: string) => {
    setActionError(null);
    try {
      await switchDefault({ runtime: 'go', version });
      await refresh();
    } catch (e) {
      setActionError(String(e));
    }
  };

  useEffect(() => {
    if (visibleOperation?.status === 'completed') {
      void refresh();
    }
  }, [visibleOperation?.id, visibleOperation?.status]);

  const installable = available?.filter((v: VersionInfo) => !v.is_installed) ?? [];

  return (
    <div className="space-y-4">
      {actionError && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-xs text-danger">
          {actionError}
        </pre>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : installed && installed.length > 0 ? (
        <div className="space-y-2">
          {installed.map((v: RuntimeVersion) => (
            <VersionRow
              key={v.version}
              label={`Go ${v.version}`}
              size={v.size}
              isDefault={v.version === defaultVersion}
              onSetDefault={v.version !== defaultVersion ? () => handleSwitchDefault(v.version) : undefined}
              onUninstall={() => handleUninstall(v.version)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="size-5" />}
          title={t('RuntimeDetail', 'NoGoVersionsInstalled')}
        />
      )}

      {visibleOperation && (
        <ProgressBlock
          label={`Go ${visibleOperation.target.version}`}
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
              label={`Go ${v.version}`}
              isInstalling={isInstalling}
              isThisInstalling={runningOperation?.target.version === v.version}
              onInstall={() => handleInstall(v.version)}
            />
          ))}
          {installable.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'AllAvailableInstalledOrUnavailable')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const GoShellInfo = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const goRoot = `~/.envora/runtimes/go/${version || '{version}'}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          {t('RuntimeDetail', 'ShellEnvironment')}
        </div>
        <div className="space-y-1 text-muted-foreground">
          <div>
            {t('RuntimeDetail', 'CommandDirectoryLinked', { commands: 'go, gofmt' })}
          </div>
          <div>
            {t('RuntimeDetail', 'VersionWritesGoRoot', { path: '' })}<code className="ml-1 rounded bg-code-bg px-1.5 py-0.5 font-mono text-xs">{goRoot}</code>
          </div>
        </div>
      </div>
    </div>
  );
};

const GoEnvTab = () => {
  const { t } = useTranslation();
  const { data: status, isLoading, mutate } = useGoEnvStatus();
  const { mutate: updateGoEnv, isLoading: isSaving } = useUpdateGoEnv();
  const [draft, setDraft] = useState<GoEnvUpdate>({});
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (status) {
      setDraft({
        gopath: status.gopath || '',
        gomodcache: status.gomodcache || '',
        gocache: status.gocache || '',
        gobin: status.gobin || '',
        goproxy: status.goproxy || '',
        gosumdb: status.gosumdb || '',
        gonosumdb: status.gonosumdb || '',
        goprivate: status.goprivate || '',
      });
    }
  }, [status]);

  const updateDraft = (key: keyof GoEnvUpdate, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  const save = async () => {
    setActionError(null);
    setMessage(null);
    try {
      const next = await updateGoEnv({ update: draft });
      await mutate(next, { revalidate: false });
      setMessage(t('Common', 'Saved'));
    } catch (e) {
      setActionError(String(e));
    }
  };

  const refresh = async () => {
    setActionError(null);
    setMessage(null);
    await mutate();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!status) {
    return <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'ToolsRequireGo')}</p>;
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-xs text-danger">
          {actionError}
        </pre>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <Label className="text-xs text-muted-foreground">{t('RuntimeDetail', 'GoExecutable')}</Label>
          <p className="mt-1 break-all font-mono text-sm">{status.go_executable || t('Common', 'NotSet')}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <Label className="text-xs text-muted-foreground">GOROOT</Label>
          <p className="mt-1 break-all font-mono text-sm">{status.goroot || t('Common', 'NotSet')}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <Label className="text-xs text-muted-foreground">{t('Common', 'Version')}</Label>
          <p className="mt-1 font-mono text-sm">{status.go_version || status.default_go_version || t('Common', 'NotSet')}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <Label className="text-xs text-muted-foreground">{t('RuntimeDetail', 'GoEnvFile')}</Label>
          <p className="mt-1 break-all font-mono text-sm">{status.goenv || t('Common', 'NotSet')}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{status.envora_goenv}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{t('RuntimeDetail', 'GoManagedPaths')}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t('RuntimeDetail', 'GoManagedPathsHint')}</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <ManagedPath label="GOENV" path={status.envora_goenv} active={status.goenv === status.envora_goenv} />
          <ManagedPath label="GOMODCACHE" path={status.envora_gomodcache} active={status.gomodcache === status.envora_gomodcache} />
          <ManagedPath label="GOCACHE" path={status.envora_gocache} active={status.gocache === status.envora_gocache} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <GoEnvField label="GOPATH" value={draft.gopath || ''} onChange={(value) => updateDraft('gopath', value)} />
          <GoEnvField label="GOBIN" value={draft.gobin || ''} onChange={(value) => updateDraft('gobin', value)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <GoEnvField label="GOMODCACHE" value={draft.gomodcache || ''} onChange={(value) => updateDraft('gomodcache', value)} />
          <GoEnvField label="GOCACHE" value={draft.gocache || ''} onChange={(value) => updateDraft('gocache', value)} />
        </div>

        <GoEnvField label="GOPROXY" value={draft.goproxy || ''} onChange={(value) => updateDraft('goproxy', value)} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              updateDraft('goproxy', 'https://goproxy.cn,direct');
              updateDraft('gosumdb', 'sum.golang.google.cn');
            }}
          >
            {t('RuntimeDetail', 'GoChinaPreset')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              updateDraft('goproxy', 'https://proxy.golang.org,direct');
              updateDraft('gosumdb', 'sum.golang.org');
            }}
          >
            {t('RuntimeDetail', 'GoOfficialPreset')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              updateDraft('goproxy', '');
              updateDraft('gosumdb', '');
            }}
          >
            {t('RuntimeDetail', 'GoUnsetPreset')}
          </Button>
          {['https://goproxy.cn,direct', 'https://proxy.golang.org,direct', 'direct'].map((proxy) => (
            <Button key={proxy} type="button" variant="outline" size="sm" onClick={() => updateDraft('goproxy', proxy)}>
              {proxy}
            </Button>
          ))}
        </div>

        <GoEnvField label="GOSUMDB" value={draft.gosumdb || ''} onChange={(value) => updateDraft('gosumdb', value)} />
        <div className="grid gap-3 md:grid-cols-2">
          <GoEnvField label="GONOSUMDB" value={draft.gonosumdb || ''} onChange={(value) => updateDraft('gonosumdb', value)} />
          <GoEnvField label="GOPRIVATE" value={draft.goprivate || ''} onChange={(value) => updateDraft('goprivate', value)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
          {t('Common', 'Save')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={refresh}>
          <RefreshCcw className="mr-2 h-3 w-3" />
          {t('Common', 'Refresh')}
        </Button>
      </div>
    </div>
  );
};

const GoEnvField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} />
  </div>
);

const ManagedPath = ({ label, path, active }: { label: string; path: string; active: boolean }) => (
  <div className="rounded-lg bg-muted/50 p-2">
    <div className="mb-1 flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {active && (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
          <Check className="mr-1 h-3 w-3" />
          OK
        </Badge>
      )}
    </div>
    <p className="break-all font-mono text-xs">{path}</p>
  </div>
);

const GoToolsTab = () => {
  const { t } = useTranslation();
  const { data: status, isLoading, mutate } = useGoToolsStatus();
  const { mutate: installTool } = useInstallGoTool();
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runInstall = async (name: string) => {
    setActionError(null);
    setBusyTool(name);
    try {
      const next = await installTool({ name, version: 'latest' });
      await mutate(next, { revalidate: false });
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusyTool(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!status) {
    return <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'ToolsRequireGo')}</p>;
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-xs text-danger">
          {actionError}
        </pre>
      )}

      <div className="rounded-lg border border-border bg-card p-3">
        <Label className="text-xs text-muted-foreground">{t('RuntimeDetail', 'GoToolsDirectory')}</Label>
        <p className="mt-1 break-all font-mono text-sm">{status.tools_bin_dir}</p>
      </div>

      <div className="space-y-2">
        {status.tools.map((tool) => (
          <div key={tool.name} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{tool.label}</span>
                {tool.installed && (
                  <Badge variant="outline">
                    <Check className="mr-1 h-3 w-3" />
                    {t('Common', 'Installed')}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{tool.package}@latest</p>
              {tool.version && <p className="mt-1 break-all font-mono text-xs">{tool.version}</p>}
            </div>
            <Button type="button" size="sm" variant={tool.installed ? 'outline' : 'default'} disabled={Boolean(busyTool)} onClick={() => runInstall(tool.name)}>
              {busyTool === tool.name ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <PackageCheck className="mr-2 h-3 w-3" />}
              {tool.installed ? t('RuntimeDetail', 'UpdateTool') : t('Common', 'Install')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

const GoMaintenanceTab = () => {
  const { t } = useTranslation();
  const { data: cacheStatus, isLoading: isCacheLoading, mutate: mutateCache } = useGoCacheStatus();
  const { mutate: clearCache } = useClearGoCache();
  const { mutate: repairSdk } = useRepairGoSdk();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runClearCache = async (target: string) => {
    setActionError(null);
    setMessage(null);
    setBusyAction(`cache-${target}`);
    try {
      const next = await clearCache({ target });
      await mutateCache(next, { revalidate: false });
      setMessage(t('RuntimeDetail', 'GoCacheCleared'));
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const runRepair = async () => {
    setActionError(null);
    setMessage(null);
    setBusyAction('repair');
    try {
      await repairSdk({});
      setMessage(t('RuntimeDetail', 'GoSdkRepaired'));
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-4">
      {actionError && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-xs text-danger">
          {actionError}
        </pre>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 font-medium">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          {t('RuntimeDetail', 'GoCache')}
        </div>
        {isCacheLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : cacheStatus ? (
          <div className="space-y-3">
            <CacheRow label="GOMODCACHE" path={cacheStatus.gomodcache} size={cacheStatus.gomodcache_size} />
            <CacheRow label="GOCACHE" path={cacheStatus.gocache} size={cacheStatus.gocache_size} />
            <CacheRow label="GOTMPDIR" path={cacheStatus.gotmpdir} />
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                ['build', t('RuntimeDetail', 'ClearBuildCache')],
                ['test', t('RuntimeDetail', 'ClearTestCache')],
                ['mod', t('RuntimeDetail', 'ClearModuleCache')],
                ['all', t('RuntimeDetail', 'ClearAllGoCache')],
              ].map(([target, label]) => (
                <Button key={target} type="button" variant="outline" size="sm" disabled={Boolean(busyAction)} onClick={() => runClearCache(target)}>
                  {busyAction === `cache-${target}` ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Trash2 className="mr-2 h-3 w-3" />}
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'ToolsRequireGo')}</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          {t('RuntimeDetail', 'GoSdkRepair')}
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{t('RuntimeDetail', 'GoSdkRepairHint')}</p>
        <Button type="button" size="sm" disabled={Boolean(busyAction)} onClick={runRepair}>
          {busyAction === 'repair' ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Wrench className="mr-2 h-3 w-3" />}
          {t('RuntimeDetail', 'RepairGoSdk')}
        </Button>
      </div>
    </div>
  );
};

const CacheRow = ({ label, path, size }: { label: string; path: string | null; size?: number }) => (
  <div className="grid gap-1 rounded-lg bg-muted/50 p-2 md:grid-cols-[120px_1fr_auto] md:items-center">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <span className="break-all font-mono text-xs">{path || '-'}</span>
    {typeof size === 'number' && <span className="text-xs text-muted-foreground">{formatBytes(size)}</span>}
  </div>
);

export const GoDetail = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('versions');

  const tabs = [
    { value: 'versions', label: t('Common', 'Versions'), title: t('Common', 'Versions'), content: <GoVersionsTab /> },
    { value: 'tools', label: t('RuntimeDetail', 'GoTools'), title: t('RuntimeDetail', 'GoTools'), content: <GoToolsTab /> },
    { value: 'env', label: t('RuntimeDetail', 'GoEnv'), title: t('RuntimeDetail', 'GoEnvSettings'), content: <GoEnvTab /> },
    { value: 'maintenance', label: t('RuntimeDetail', 'Maintenance'), title: t('RuntimeDetail', 'Maintenance'), content: <GoMaintenanceTab /> },
    { value: 'shell', label: 'Shell', title: t('RuntimeDetail', 'Environment', { name: 'Go' }), content: <GoShellInfo version={version} /> },
  ];

  return <DetailTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} />;
};

const formatBytes = (bytes: number): string => {
  if (!bytes) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

