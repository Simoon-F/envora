import { useState } from 'react';
import { useInstalledVersions, useDefaultVersion } from '@/hooks/use-runtimes';
import type { RuntimeType } from '@/types/runtime';
import { PHPDetail } from '@/pages/php-runtime/components/php-detail';
import { MySQLDetail } from '@/pages/mysql-runtime/components/mysql-detail';
import { NginxDetail } from '@/pages/nginx-runtime/components/nginx-detail';
import { JavaDetail } from '@/pages/java-runtime/components/java-detail';
import { NodeDetail } from '@/pages/node-runtime/components/node-detail';
import { GoDetail } from '@/pages/go-runtime/components/go-detail';
import { useTranslation } from '@/i18n/use-translation';
import { RuntimeIcon } from '@/components/runtime/runtime-icons';
import { RuntimeHeader } from '@/components/runtime/runtime-header';
import { cn } from '@/lib/utils';

const runtimes: { type: RuntimeType; name: string; icon: React.ReactNode }[] = [
  { type: 'php', name: 'PHP', icon: <RuntimeIcon type="php" className="size-6" /> },
  { type: 'nginx', name: 'Nginx', icon: <RuntimeIcon type="nginx" className="size-6" /> },
  { type: 'mysql', name: 'MySQL', icon: <RuntimeIcon type="mysql" className="size-6" /> },
  { type: 'java', name: 'Java', icon: <RuntimeIcon type="java" className="size-6" /> },
  { type: 'node', name: 'Node.js', icon: <RuntimeIcon type="node" className="size-6" /> },
  { type: 'go', name: 'Go', icon: <RuntimeIcon type="go" className="size-6" /> },
];

export const Runtimes = () => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<RuntimeType>('php');
  const { data: installedPhp } = useInstalledVersions('php');
  const { data: installedNginx } = useInstalledVersions('nginx');
  const { data: installedMysql } = useInstalledVersions('mysql');
  const { data: installedJava } = useInstalledVersions('java');
  const { data: installedNode } = useInstalledVersions('node');
  const { data: installedGo } = useInstalledVersions('go');
  const { data: phpVer } = useDefaultVersion('php');
  const { data: nginxVer } = useDefaultVersion('nginx');
  const { data: mysqlVer } = useDefaultVersion('mysql');
  const { data: javaVer } = useDefaultVersion('java');
  const { data: nodeVer } = useDefaultVersion('node');
  const { data: goVer } = useDefaultVersion('go');

  const getVersion = (type: RuntimeType): string => {
    const installed =
      type === 'php'
        ? installedPhp
        : type === 'nginx'
          ? installedNginx
          : type === 'mysql'
            ? installedMysql
            : type === 'java'
              ? installedJava
              : type === 'node'
                ? installedNode
                : installedGo;
    const def =
      type === 'php'
        ? phpVer
        : type === 'nginx'
          ? nginxVer
          : type === 'mysql'
            ? mysqlVer
            : type === 'java'
              ? javaVer
              : type === 'node'
                ? nodeVer
                : goVer;
    return def || installed?.[0]?.version || '';
  };

  const runtimeInfo = runtimes.find((runtime) => runtime.type === selected)!;
  const version = getVersion(selected);

  const renderDetail = () => {
    switch (selected) {
      case 'php':
        return <PHPDetail key={version} version={version || 'latest'} />;
      case 'nginx':
        return <NginxDetail key={version} version={version || 'latest'} />;
      case 'mysql':
        return <MySQLDetail key={version} version={version || 'latest'} />;
      case 'java':
        return <JavaDetail key={version} version={version || 'latest'} />;
      case 'node':
        return <NodeDetail key={version} version={version || 'latest'} />;
      case 'go':
        return <GoDetail key={version} version={version || 'latest'} />;
    }
  };

  return (
    <div className="runtime-detail-layout">
      {/* Runtime selector */}
      <aside className="runtime-selector">
        <h2 className="runtime-selector-title">{t('Runtimes', 'Runtimes')}</h2>
        <div className="runtime-selector-inner">
          <div className="space-y-0.5">
            {runtimes.map((runtime) => {
              const installed =
                runtime.type === 'php'
                  ? installedPhp
                  : runtime.type === 'nginx'
                    ? installedNginx
                    : runtime.type === 'mysql'
                      ? installedMysql
                      : runtime.type === 'java'
                        ? installedJava
                        : runtime.type === 'node'
                          ? installedNode
                          : installedGo;
              const count = installed?.length ?? 0;
              return (
                <button
                  key={runtime.type}
                  type="button"
                  onClick={() => setSelected(runtime.type)}
                  className={cn(
                    'runtime-list-item',
                    selected === runtime.type ? 'runtime-list-item-active' : '',
                  )}
                >
                  <span className={cn('shrink-0 transition-colors', selected === runtime.type ? 'text-primary' : 'text-muted-foreground')}>
                    {runtime.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-sm transition-colors', selected === runtime.type ? 'font-medium text-foreground' : 'text-foreground')}>
                      {runtime.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {t('Runtimes', 'InstalledVersionsCount', { count })}
                    </div>
                  </div>
                  {count > 0 && (
                    <span className={cn('size-1.5 rounded-full shrink-0', selected === runtime.type ? 'bg-primary' : 'bg-muted-foreground/30')} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Detail panel */}
      <div className="runtime-content">
        <div className="runtime-content-inner">
          <RuntimeHeader
            icon={runtimeInfo.icon}
            name={runtimeInfo.name}
            version={version}
            className="mb-6"
          />
          <div className="p-1">{renderDetail()}</div>
        </div>
      </div>
    </div>
  );
};
