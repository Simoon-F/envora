import { Badge } from '@/components/ui/badge';
import { NodeDetail } from './components/node-detail';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { RuntimeHeader } from '@/components/runtime/runtime-header';
import { NodeIcon } from '@/components/runtime/runtime-icons';

export const NodeRuntime = () => {
  const { t } = useTranslation();
  const { data: installed } = useInstalledVersions('node');
  const { data: defaultVersion } = useDefaultVersion('node');
  const currentVersion = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="space-y-5 p-5">
      <RuntimeHeader
        icon={<NodeIcon className="size-9" />}
        name="Node.js"
        version={currentVersion}
        actions={
          currentVersion ? (
            <Badge variant="outline">{t('Common', 'DefaultValue', { value: currentVersion })}</Badge>
          ) : undefined
        }
      />
      <NodeDetail version={currentVersion || 'latest'} />
    </div>
  );
};
