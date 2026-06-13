import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Download, Loader2, Terminal, Trash2 } from 'lucide-react';
import {
  useAvailableVersions,
  useDefaultVersion,
  useInstalledVersions,
  useStartRuntimeInstall,
  useSwitchDefault,
  useUninstallVersion,
} from '@/hooks/use-runtimes';
import { useOperationsStore } from '@/stores/operations';
import type { RuntimeVersion, VersionInfo } from '@/types/runtime';

function NodeVersionsTab() {
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
                    默认
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formatBytes(v.size)}</span>
                {v.version !== defaultVersion && (
                  <Button variant="ghost" size="sm" onClick={() => handleSwitchDefault(v.version)}>
                    设为默认
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleUninstall(v.version)} title="卸载">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">尚未安装任何 Node.js 版本。</p>
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
                清除
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium">可安装版本</h4>
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
            <p className="text-sm text-muted-foreground">当前可用版本都已安装，或当前平台暂无可用包。</p>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeShellInfo({ version }: { version: string }) {
  const nodeHome = `~/.envora/runtimes/node/${version || '{version}'}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          Shell 环境
        </div>
        <div className="space-y-1 text-muted-foreground">
          <div>
            <code>node</code>、<code>npm</code>、<code>npx</code>、<code>corepack</code> 会链接到 Envora 的 bin 目录。
          </div>
          <div>
            当前默认安装目录：<code>{nodeHome}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NodeDetail({ version }: { version: string }) {
  const [activeTab, setActiveTab] = useState('versions');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="versions">版本</TabsTrigger>
        <TabsTrigger value="shell">Shell</TabsTrigger>
      </TabsList>
      <TabsContent value="versions" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">版本</CardTitle>
          </CardHeader>
          <CardContent>
            <NodeVersionsTab />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="shell" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Node.js 环境</CardTitle>
          </CardHeader>
          <CardContent>
            <NodeShellInfo version={version} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
