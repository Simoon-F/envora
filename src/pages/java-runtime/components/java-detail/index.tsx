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
import { useTranslation } from '@/i18n/use-translation';
import { useOperationsStore } from '@/stores/operations';
import type { RuntimeVersion, VersionInfo } from '@/types/runtime';

const JavaVersionsTab = () => {
  const { t } = useTranslation();
  const { data: installed, isLoading, mutate } = useInstalledVersions('java');
  const { data: available, mutate: mutateAvailable } = useAvailableVersions('java');
  const { data: defaultVersion, mutate: mutateDefault } = useDefaultVersion('java');
  const { mutate: startInstall } = useStartRuntimeInstall();
  const { mutate: uninstallVersion } = useUninstallVersion();
  const { mutate: switchDefault } = useSwitchDefault();
  const operations = useOperationsStore((state) => state.operations);
  const upsertOperation = useOperationsStore((state) => state.upsert);
  const removeOperation = useOperationsStore((state) => state.remove);
  const [actionError, setActionError] = useState<string | null>(null);

  const javaOperations = Object.values(operations)
    .filter((operation) => operation.kind === 'runtime_install' && operation.target.runtime === 'java')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const runningOperation = javaOperations.find((operation) => operation.status === 'running' || operation.status === 'queued');
  const visibleOperation = runningOperation || javaOperations[0];
  const isInstalling = Boolean(runningOperation);

  const refresh = async () => {
    await Promise.all([mutate(), mutateAvailable(), mutateDefault()]);
  };

  const handleInstall = async (version: string) => {
    setActionError(null);
    try {
      const operation = await startInstall({ runtime: 'java', version });
      upsertOperation(operation);
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleUninstall = async (version: string) => {
    setActionError(null);
    try {
      await uninstallVersion({ runtime: 'java', version });
      await refresh();
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleSwitchDefault = async (version: string) => {
    setActionError(null);
    try {
      await switchDefault({ runtime: 'java', version });
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
                <span className="font-mono text-sm">JDK {v.version}</span>
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
                <Button variant="ghost" size="sm" onClick={() => handleUninstall(v.version)} title={t('Common', 'Installed')}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'NoJavaVersionsInstalled')}</p>
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
              JDK {visibleOperation.target.version}：{visibleOperation.error || visibleOperation.message} ({visibleOperation.percent.toFixed(0)}%)
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
              <span className="font-mono text-sm">JDK {v.version}</span>
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
            <p className="text-sm text-muted-foreground">{t('RuntimeDetail', 'AllAvailableInstalled')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const JavaShellInfo = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const javaHome = `~/.envora/runtimes/java/${version || '{version}'}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          {t('RuntimeDetail', 'ShellEnvironment')}
        </div>
        <div className="space-y-1 text-muted-foreground">
          <div>
            {t('RuntimeDetail', 'CommandDirectoryLinked', { commands: 'java, javac, jar' })}
          </div>
          <div>
            {t('RuntimeDetail', 'VersionWritesJavaHome', { path: '' })}<code>{javaHome}</code>
          </div>
        </div>
      </div>
    </div>
  );
};

export const JavaDetail = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('versions');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="versions">{t('Common', 'Versions')}</TabsTrigger>
        <TabsTrigger value="shell">Shell</TabsTrigger>
      </TabsList>
      <TabsContent value="versions" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('Common', 'Versions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <JavaVersionsTab />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="shell" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('RuntimeDetail', 'Environment', { name: 'Java' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <JavaShellInfo version={version} />
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
