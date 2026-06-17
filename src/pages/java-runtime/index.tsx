import { Badge } from '@/components/ui/badge';
import { JavaDetail } from './components/java-detail';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';

export const JavaRuntime = () => {
  const { data: installed } = useInstalledVersions('java');
  const { data: defaultVersion } = useDefaultVersion('java');
  const currentVersion = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">☕</span>
        <h1 className="text-2xl font-bold">Java</h1>
        {currentVersion && <Badge variant="outline">默认：{currentVersion}</Badge>}
      </div>

      <JavaDetail version={currentVersion || 'latest'} />
    </div>
  );
};
