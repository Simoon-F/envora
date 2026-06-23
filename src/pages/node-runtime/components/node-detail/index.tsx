import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Download, FolderOpen, Loader2, PackageCheck, Power, RefreshCcw, Terminal, Trash2 } from 'lucide-react';
import {
  useAvailableVersions,
  useDefaultVersion,
  useInstallNodePackageManager,
  useInstallProjectPackageManager,
  useInstalledVersions,
  useNodePackageManagerStatus,
  useSetCorepackEnabled,
  useStartRuntimeInstall,
  useSwitchDefault,
  useUninstallVersion,
} from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { useOperationsStore } from '@/stores/operations';
import type { NodePackageManagerName, NodePackageManagerStatus, NodeToolStatus, RuntimeVersion, VersionInfo } from '@/types/runtime';

const NodeVersionsTab = () => {
  const { t } = useTranslation();
  const { data: installed, isLoading, mutate } = useInstalledVersions('node');
  const { data: available, mutate: mutateAvailable } = useAvailableVersions('node');
  const { data: defaultVersion, mutate: mutateDefault } = useDefaultVersion('node');
  const { mutate: startInstall } = useStartRuntimeInstall();
  const { mutate: uninstallVersion } = useUninstallVersion();
  const { mutate: switchDefault } = useSwitchDefault();
  const operations = useOperationsStore((state) => state.operations);
  const upsertOperation = useOperationsStore((state) => state.upsert);
  const removeOperation = useOperationsStore((state) => state.remove);
  const [actionError, setActionError] = useState<string | null>(null);

  const nodeOperations = Object.values(operations)
    .filter((operation) => operation.kind === 'runtime_install' && operation.target.runtime === 'node')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const runningOperation = nodeOperations.find((operation) => operation.status === 'running' || operation.status === 'queued');
  const visibleOperation = runningOperation || nodeOperations[0];
  const isInstalling = Boolean(runningOperation);

  const refresh = async () => {
    await Promise.all([mutate(), mutateAvailable(), mutateDefault()]);
  };

  const handleInstall = async (version: string) => {
    setActionError(null);
    try {
      const operation = await startInstall({ runtime: 'node', version });
      upsertOperation(operation);
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleUninstall = async (version: string) => {
    setActionError(null);
    try {
      await uninstallVersion({ runtime: 'node', version });
      await refresh();
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleSwitchDefault = async (version: string) => {
    setActionError(null);
    try {
      await switchDefault({ runtime: 'node', version });
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
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          {actionError}
        </pre>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : installed && installed.length > 0 ? (
        <div className="space-y-2">
          {installed.map((v: RuntimeVersion) => (
            <div key={v.version} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">Node.js {v.version}</span>
                {v.version === defaultVersion && (
                  <Badge>
                    <Check className="mr-1 h-3 w-3" />
                    {t('Common', 'Default')}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formatBytes(v.size)}</span>
                {v.version !== defaultVersion && (
                  <Button variant="ghost" size="sm" onClick={() => handleSwitchDefault(v.version)}>
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
        <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'NoNodeVersionsInstalled')}</p>
      )}

      {visibleOperation && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-300 ${
                visibleOperation.status === 'failed' ? 'bg-destructive' : 'bg-primary'
              }`}
              style={{ width: `${visibleOperation.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Node.js {visibleOperation.target.version}：{visibleOperation.error || visibleOperation.message} ({visibleOperation.percent.toFixed(0)}%)
            </span>
            {visibleOperation.status !== 'running' && visibleOperation.status !== 'queued' && (
              <button
                type="button"
                className="shrink-0 text-foreground hover:underline"
                onClick={() => removeOperation(visibleOperation.id)}
              >
                {t('Common', 'Clear')}
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium">{t('RuntimeDetail', 'AvailableVersions')}</h4>
        <div className="space-y-1">
          {installable.map((v: VersionInfo) => (
            <button
              key={v.version}
              type="button"
              className="flex w-full items-center justify-between rounded-md border p-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isInstalling}
              onClick={() => handleInstall(v.version)}
            >
              <span className="font-mono text-sm">Node.js {v.version}</span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md">
                {runningOperation?.target.version === v.version ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </span>
            </button>
          ))}
          {installable.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'AllAvailableInstalledOrUnavailable')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const NodeShellInfo = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const nodeHome = `~/.envora/runtimes/node/${version || '{version}'}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          {t('RuntimeDetail', 'ShellEnvironment')}
        </div>
        <div className="space-y-1 text-muted-foreground">
          <div>
            {t('RuntimeDetail', 'CommandDirectoryLinked', { commands: 'node, npm, npx, corepack' })}
          </div>
          <div>
            {t('RuntimeDetail', 'CurrentDefaultInstallDir', { path: '' })}<code>{nodeHome}</code>
          </div>
        </div>
      </div>
    </div>
  );
};

const NodePackageManagersTab = () => {
  const { t } = useTranslation();
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [draftProjectDir, setDraftProjectDir] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { data: status, isLoading, mutate } = useNodePackageManagerStatus(projectDir);
  const { mutate: setCorepackEnabled } = useSetCorepackEnabled();
  const { mutate: installPackageManager } = useInstallNodePackageManager();
  const { mutate: installProjectPackageManager } = useInstallProjectPackageManager();

  useEffect(() => {
    if (!draftProjectDir && status?.project_dir) {
      setDraftProjectDir(status.project_dir);
    }
  }, [draftProjectDir, status?.project_dir]);

  const refresh = async () => {
    setActionError(null);
    await mutate();
  };

  const runAction = async (action: string, fn: () => Promise<NodePackageManagerStatus>) => {
    setActionError(null);
    setBusyAction(action);
    try {
      await fn();
      await mutate();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const chooseProjectDir = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      setDraftProjectDir(selected);
      setProjectDir(selected);
    }
  };

  const activateProjectDir = () => {
    setProjectDir(draftProjectDir.trim() || null);
  };

  const handleCorepack = (enabled: boolean) => {
    void runAction(enabled ? 'corepack-enable' : 'corepack-disable', () => setCorepackEnabled({ enabled }));
  };

  const handleInstallPackageManager = (manager: NodePackageManagerName, version?: string) => {
    void runAction(`${manager}-install`, () => installPackageManager({ manager, version }));
  };

  const handleInstallProjectPackageManager = () => {
    const targetDir = status?.project_dir || draftProjectDir.trim();
    if (!targetDir) return;
    void runAction('project-install', () => installProjectPackageManager({ projectDir: targetDir }));
  };

  const node = findTool(status, 'node');
  const npm = findTool(status, 'npm');
  const npx = findTool(status, 'npx');
  const corepack = findTool(status, 'corepack');
  const yarn = findTool(status, 'yarn');
  const pnpm = findTool(status, 'pnpm');
  const hasNode = Boolean(status?.default_node_version);
  const isBusy = Boolean(busyAction);

  return (
    <div className="space-y-4 text-sm">
      {actionError && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          {actionError}
        </pre>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          {!hasNode && (
            <div className="rounded-md border border-dashed p-3 text-muted-foreground">
              {t('RuntimeDetail', 'ToolsRequireNode')}
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <ToolStatusRow tool={node} label="Node.js" note={status?.default_node_version ? t('Common', 'DefaultValue', { value: status.default_node_version }) : t('Common', 'NotSet')} />
            <ToolStatusRow tool={npm} label="npm" note={t('RuntimeDetail', 'UsesNode')} />
            <ToolStatusRow tool={npx} label="npx" note={t('RuntimeDetail', 'UsesNpm')} />
            <ToolStatusRow tool={corepack} label="Corepack" note={status?.corepack_enabled ? t('RuntimeDetail', 'ShimsEnabled') : t('RuntimeDetail', 'ShimsDisabled')} />
            <ToolStatusRow tool={pnpm} label="pnpm" note={t('RuntimeDetail', 'UsesCorepackProxy')} />
            <ToolStatusRow tool={yarn} label="Yarn" note={t('RuntimeDetail', 'UsesCorepackProxy')} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={status?.corepack_enabled ? 'outline' : 'default'}
              size="sm"
              disabled={!hasNode || isBusy}
              onClick={() => handleCorepack(!status?.corepack_enabled)}
            >
              {busyAction?.startsWith('corepack') ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
              {status?.corepack_enabled ? t('RuntimeDetail', 'ToggleCorepackOff') : t('RuntimeDetail', 'ToggleCorepackOn')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNode || isBusy}
              onClick={() => handleInstallPackageManager('pnpm', 'latest')}
            >
              {busyAction === 'pnpm-install' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageCheck className="h-3 w-3" />}
              {t('RuntimeDetail', 'ActivatePnpmLatest')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNode || isBusy}
              onClick={() => handleInstallPackageManager('yarn', 'stable')}
            >
              {busyAction === 'yarn-install' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageCheck className="h-3 w-3" />}
              {t('RuntimeDetail', 'ActivateYarnStable')}
            </Button>
            <Button variant="ghost" size="sm" disabled={isBusy} onClick={refresh}>
              <RefreshCcw className="h-3 w-3" />
              {t('Common', 'Refresh')}
            </Button>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="node-project-dir">{t('RuntimeDetail', 'ProjectDirectory')}</Label>
                <Input
                  id="node-project-dir"
                  value={draftProjectDir}
                  placeholder="/path/to/project"
                  onChange={(event) => setDraftProjectDir(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      activateProjectDir();
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={isBusy} onClick={chooseProjectDir}>
                  <FolderOpen className="h-3 w-3" />
                  {t('Common', 'Select')}
                </Button>
                <Button variant="outline" size="sm" disabled={isBusy} onClick={activateProjectDir}>
                  {t('RuntimeDetail', 'Read')}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="font-medium">
                  {status?.project_package_manager ? status.project_package_manager.raw : t('Common', 'Missing') + ' packageManager'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {status?.project_package_manager
                    ? status.project_package_manager.package_json_path
                    : t('RuntimeDetail', 'ProjectPackageManagerFallback')}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNode || isBusy || !status?.project_package_manager || !status.project_dir}
                onClick={handleInstallProjectPackageManager}
              >
                {busyAction === 'project-install' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageCheck className="h-3 w-3" />}
                {t('RuntimeDetail', 'InstallProjectPackageManager')}
              </Button>
            </div>
          </div>

          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            {t('RuntimeDetail', 'NpmFollowsNode')}
            <code className="ml-1">{status?.bin_dir}</code>
          </div>
        </>
      )}
    </div>
  );
};

const ToolStatusRow = ({ tool, label, note }: { tool?: NodeToolStatus; label: string; note: string }) => {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{note}</div>
      </div>
      <Badge variant={tool?.version ? 'default' : 'outline'} className="shrink-0 font-mono">
        {tool?.version || t('Common', 'NotReady')}
      </Badge>
    </div>
  );
};

const findTool = (status: NodePackageManagerStatus | undefined, name: string) => {
  return status?.tools.find((tool) => tool.name === name);
};

export const NodeDetail = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('versions');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="versions">{t('Common', 'Versions')}</TabsTrigger>
        <TabsTrigger value="packages">{t('RuntimeDetail', 'PackageManagers')}</TabsTrigger>
        <TabsTrigger value="shell">Shell</TabsTrigger>
      </TabsList>
      <TabsContent value="versions" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('Common', 'Versions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <NodeVersionsTab />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="packages" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Node.js {t('RuntimeDetail', 'PackageManagers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <NodePackageManagersTab />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="shell" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('RuntimeDetail', 'Environment', { name: 'Node.js' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <NodeShellInfo version={version} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
