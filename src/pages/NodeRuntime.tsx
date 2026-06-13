import { Badge } from '@/components/ui/badge';
import { NodeDetail } from '@/components/runtime/NodeDetail';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/useRuntimes';

export function NodeRuntime() {
  const { data: installed } = useInstalledVersions('node');
  const { data: defaultVersion } = useDefaultVersion('node');
  const currentVersion = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">⬢</span>
        <h1 className="text-2xl font-bold">Node.js</h1>
        {currentVersion && <Badge variant="outline">默认：{currentVersion}</Badge>}
      </div>

      <NodeDetail version={currentVersion || 'latest'} />
    </div>
  );
}
