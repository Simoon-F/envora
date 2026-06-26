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
import { RuntimeItem, type RuntimeItemInfo } from './components/runtime-item';

const runtimes: RuntimeItemInfo[] = [
  { type: 'php', name: 'PHP', icon: <RuntimeIcon type="php" className="size-4" /> },
  { type: 'nginx', name: 'Nginx', icon: <RuntimeIcon type="nginx" className="size-4" /> },
  { type: 'mysql', name: 'MySQL', icon: <RuntimeIcon type="mysql" className="size-4" /> },
  { type: 'java', name: 'Java', icon: <RuntimeIcon type="java" className="size-4" /> },
  { type: 'node', name: 'Node.js', icon: <RuntimeIcon type="node" className="size-4" /> },
  { type: 'go', name: 'Go', icon: <RuntimeIcon type="go" className="h-4 w-9" /> },
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
    <div className="flex h-full">
      {/* Runtime selector */}
      <aside className="w-60 shrink-0 border-r border-border bg-muted/20 p-3">
        <h2 className="px-3 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {t('Runtimes', 'Runtimes')}
        </h2>
        <div className="space-y-1">
          {runtimes.map((runtime) => (
            <RuntimeItem
              key={runtime.type}
              runtime={runtime}
              selected={selected === runtime.type}
              onSelect={() => setSelected(runtime.type)}
            />
          ))}
        </div>
      </aside>

      {/* Detail panel */}
      <div className="flex-1 overflow-auto p-6">
        <RuntimeHeader
          icon={runtimeInfo.icon}
          name={runtimeInfo.name}
          version={version}
          className="mb-6"
        />
        <div className="p-1">{renderDetail()}</div>
      </div>
    </div>
  );
};
