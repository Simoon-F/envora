import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useInstalledVersions, useDefaultVersion } from '@/hooks/use-runtimes';
import type { RuntimeType } from '@/types/runtime';
import { PHPDetail } from '@/pages/php-runtime/components/php-detail';
import { MySQLDetail } from '@/pages/mysql-runtime/components/mysql-detail';
import { NginxDetail } from '@/pages/nginx-runtime/components/nginx-detail';
import { JavaDetail } from '@/pages/java-runtime/components/java-detail';
import { NodeDetail } from '@/pages/node-runtime/components/node-detail';
import { GoDetail } from '@/pages/go-runtime/components/go-detail';
import { useTranslation } from '@/i18n/use-translation';
import { GoLogo } from '@/components/runtime/go-logo';
import { RuntimeItem, type RuntimeItemInfo } from './components/runtime-item';

const runtimes: RuntimeItemInfo[] = [
  { type: 'php', name: 'PHP', icon: '🐘' },
  { type: 'nginx', name: 'Nginx', icon: '🌐' },
  { type: 'mysql', name: 'MySQL', icon: '🐬' },
  { type: 'java', name: 'Java', icon: '☕' },
  { type: 'node', name: 'Node.js', icon: '⬢' },
  { type: 'go', name: 'Go', icon: <GoLogo className="h-4 w-11" /> },
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
      {/* Sidebar */}
      <div className="w-56 border-r p-3 space-y-1 flex-shrink-0">
        <h2 className="text-sm font-semibold px-3 py-2 text-muted-foreground">{t('Runtimes', 'Runtimes')}</h2>
        {runtimes.map((runtime) => (
          <RuntimeItem
            key={runtime.type}
            runtime={runtime}
            selected={selected === runtime.type}
            onSelect={() => setSelected(runtime.type)}
          />
        ))}
      </div>
      {/* Detail Panel */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-8 min-w-8 items-center text-2xl">{runtimeInfo.icon}</span>
          {runtimeInfo.type !== 'go' && <h1 className="text-xl font-bold">{runtimeInfo.name}</h1>}
          {version && <Badge variant="outline" className="ml-2">v{version}</Badge>}
        </div>
        <div className="p-1">{renderDetail()}</div>
      </div>
    </div>
  );
};
