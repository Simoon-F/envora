import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useInstalledVersions, useDefaultVersion } from '@/hooks/useRuntimes';
import type { RuntimeType } from '@/types/runtime';
import { PHPDetail } from '@/components/runtime/PHPDetail';
import { MySQLDetail } from '@/components/runtime/MySQLDetail';
import { NginxDetail } from '@/components/runtime/NginxDetail';

const runtimes: { type: RuntimeType; name: string; icon: string }[] = [
  { type: 'php', name: 'PHP', icon: '🐘' },
  { type: 'nginx', name: 'Nginx', icon: '🌐' },
  { type: 'mysql', name: 'MySQL', icon: '🐬' },
];

// ── Sidebar Item ───────────────────────────────────────────────────

function RuntimeItem({ runtime, selected, onSelect }: { runtime: { type: RuntimeType; name: string; icon: string }; selected: boolean; onSelect: () => void }) {
  const { data: installed } = useInstalledVersions(runtime.type);
  const count = installed?.length ?? 0;
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors ${selected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'}`}
    >
      <span className="text-xl">{runtime.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{runtime.name}</div>
        <div className="text-xs text-muted-foreground">{count} installed</div>
      </div>
      {count > 0 && <span className={`w-2 h-2 rounded-full ${selected ? 'bg-primary' : 'bg-muted-foreground/30'}`} />}
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export function Runtimes() {
  const [selected, setSelected] = useState<RuntimeType>('php');
  const { data: installedPhp } = useInstalledVersions('php');
  const { data: installedNginx } = useInstalledVersions('nginx');
  const { data: installedMysql } = useInstalledVersions('mysql');
  const { data: phpVer } = useDefaultVersion('php');
  const { data: nginxVer } = useDefaultVersion('nginx');
  const { data: mysqlVer } = useDefaultVersion('mysql');

  const getVersion = (type: RuntimeType): string => {
    const installed = type === 'php' ? installedPhp : type === 'nginx' ? installedNginx : installedMysql;
    const def = type === 'php' ? phpVer : type === 'nginx' ? nginxVer : mysqlVer;
    return def || installed?.[0]?.version || '';
  };

  const runtimeInfo = runtimes.find(r => r.type === selected)!;
  const version = getVersion(selected);

  const renderDetail = () => {
    switch (selected) {
      case 'php': return <PHPDetail key={version} version={version || 'latest'} />;
      case 'nginx': return <NginxDetail key={version} version={version || 'latest'} />;
      case 'mysql': return <MySQLDetail key={version} version={version || 'latest'} />;
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 border-r p-3 space-y-1 flex-shrink-0">
        <h2 className="text-sm font-semibold px-3 py-2 text-muted-foreground">Runtimes</h2>
        {runtimes.map(r => (
          <RuntimeItem
            key={r.type}
            runtime={r}
            selected={selected === r.type}
            onSelect={() => setSelected(r.type)}
          />
        ))}
      </div>
      {/* Detail Panel */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">{runtimeInfo.icon}</span>
          <h1 className="text-xl font-bold">{runtimeInfo.name}</h1>
          {version && <Badge variant="outline" className="ml-2">v{version}</Badge>}
        </div>
        <div className="p-1">{renderDetail()}</div>
      </div>
    </div>
  );
}
