import { Badge } from '@/components/ui/badge';
import { NodeDetail } from './components/node-detail';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';

export const NodeRuntime = () => {
  const { t } = useTranslation();
  const { data: installed } = useInstalledVersions('node');
  const { data: defaultVersion } = useDefaultVersion('node');
  const currentVersion = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">⬢</span>
        <h1 className="text-2xl font-bold">Node.js</h1>
        {currentVersion && <Badge variant="outline">{t('Common', 'DefaultValue', { value: currentVersion })}</Badge>}
      </div>

      <NodeDetail version={currentVersion || 'latest'} />
    </div>
  );
};
