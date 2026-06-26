import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderOpen, Loader2, Package, PackageCheck, Power, RefreshCcw, Terminal } from 'lucide-react';
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
import { VersionRow } from '@/components/runtime/version-row';
import { InstallableVersionRow } from '@/components/runtime/installable-version-row';
import { ProgressBlock } from '@/components/runtime/progress-block';
import { DetailTabs } from '@/components/runtime/detail-tabs';
import { EmptyState } from '@/components/runtime/empty-state';

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
              label={`Node.js ${v.version}`}
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
          title={t('RuntimeDetail', 'NoNodeVersionsInstalled')}
        />
      )}

      {visibleOperation && (
        <ProgressBlock
          label={`Node.js ${visibleOperation.target.version}`}
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
              label={`Node.js ${v.version}`}
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

const NodeShellInfo = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const nodeHome = `~/.envora/runtimes/node/${version || '{version}'}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          {t('RuntimeDetail', 'ShellEnvironment')}
        </div>
        <div className="space-y-1 text-muted-foreground">
          <div>
            {t('RuntimeDetail', 'CommandDirectoryLinked', { commands: 'node, npm, npx, corepack' })}
          </div>
          <div>
            {t('RuntimeDetail', 'CurrentDefaultInstallDir', { path: '' })}<code className="ml-1 rounded bg-code-bg px-1.5 py-0.5 font-mono text-xs">{nodeHome}</code>
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
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-xs text-danger">
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
            <div className="rounded-lg border border-dashed border-border p-3 text-muted-foreground">
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

          <div className="space-y-3 rounded-lg border border-border bg-card p-3">
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

            <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 md:flex-row md:items-center md:justify-between">
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

          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            {t('RuntimeDetail', 'NpmFollowsNode')}<code className="ml-1 rounded bg-code-bg px-1.5 py-0.5 font-mono">{status?.bin_dir}</code>
          </div>
        </>
      )}
    </div>
  );
};

const ToolStatusRow = ({ tool, label, note }: { tool?: NodeToolStatus; label: string; note: string }) => {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{note}</div>
      </div>
      <Badge variant={tool?.version ? 'success' : 'outline'} className="shrink-0 font-mono">
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

  const tabs = [
    { value: 'versions', label: t('Common', 'Versions'), title: t('Common', 'Versions'), content: <NodeVersionsTab /> },
    { value: 'packages', label: t('RuntimeDetail', 'PackageManagers'), title: `Node.js ${t('RuntimeDetail', 'PackageManagers')}`, content: <NodePackageManagersTab /> },
    { value: 'shell', label: 'Shell', title: t('RuntimeDetail', 'Environment', { name: 'Node.js' }), content: <NodeShellInfo version={version} /> },
  ];

  return <DetailTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} />;
};

