import { Badge } from '@/components/ui/badge';
import { GoDetail } from './components/go-detail';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { RuntimeHeader } from '@/components/runtime/runtime-header';
import { RuntimeIcon } from '@/components/runtime/runtime-icons';

export const GoRuntime = () => {
  const { t } = useTranslation();
  const { data: installed } = useInstalledVersions('go');
  const { data: defaultVersion } = useDefaultVersion('go');
  const currentVersion = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="space-y-5 p-5">
      <RuntimeHeader
        icon={<RuntimeIcon type="go" className="size-9" />}
        name="Go"
        version={currentVersion}
        actions={
          currentVersion ? (
            <Badge variant="outline">{t('Common', 'DefaultValue', { value: currentVersion })}</Badge>
          ) : undefined
        }
      />
      <GoDetail version={currentVersion || 'latest'} />
    </div>
  );
};
