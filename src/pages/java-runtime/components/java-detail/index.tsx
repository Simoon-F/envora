import { useEffect, useState } from 'react';
import { Loader2, Terminal, Package } from 'lucide-react';
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
import { VersionRow } from '@/components/runtime/version-row';
import { InstallableVersionRow } from '@/components/runtime/installable-version-row';
import { ProgressBlock } from '@/components/runtime/progress-block';
import { DetailTabs } from '@/components/runtime/detail-tabs';
import { EmptyState } from '@/components/runtime/empty-state';

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

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {actionError && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-xs text-danger">
          {actionError}
        </pre>
      )}

      {installed && installed.length > 0 ? (
        <div className="space-y-2">
          {installed.map((v: RuntimeVersion) => (
            <VersionRow
              key={v.version}
              label={`JDK ${v.version}`}
              size={v.size}
              isDefault={v.version === defaultVersion}
              onSetDefault={
                v.version !== defaultVersion
                  ? () => handleSwitchDefault(v.version)
                  : undefined
              }
              onUninstall={() => handleUninstall(v.version)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="size-5" />}
          title={t('RuntimeDetail', 'NoJavaVersionsInstalled')}
        />
      )}

      {visibleOperation && (
        <ProgressBlock
          label={`JDK ${visibleOperation.target.version}`}
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
              label={`JDK ${v.version}`}
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

const JavaShellInfo = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const javaHome = `~/.envora/runtimes/java/${version || '{version}'}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Terminal className="size-4 text-muted-foreground" />
          {t('RuntimeDetail', 'ShellEnvironment')}
        </div>
        <div className="space-y-1 text-muted-foreground">
          <div>
            {t('RuntimeDetail', 'CommandDirectoryLinked', { commands: 'java, javac, jar' })}
          </div>
          <div>
            {t('RuntimeDetail', 'VersionWritesJavaHome', { path: '' })}
            <code className="ml-1 rounded bg-code-bg px-1.5 py-0.5 font-mono text-xs">{javaHome}</code>
          </div>
        </div>
      </div>
    </div>
  );
};

export const JavaDetail = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('versions');

  const tabs = [
    { value: 'versions', label: t('Common', 'Versions'), title: t('Common', 'Versions'), content: <JavaVersionsTab /> },
    { value: 'shell', label: 'Shell', title: t('RuntimeDetail', 'Environment', { name: 'Java' }), content: <JavaShellInfo version={version} /> },
  ];

  return <DetailTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} />;
};
