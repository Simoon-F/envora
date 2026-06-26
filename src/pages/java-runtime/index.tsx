import { Badge } from '@/components/ui/badge';
import { JavaDetail } from './components/java-detail';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { RuntimeHeader } from '@/components/runtime/runtime-header';
import { JavaIcon } from '@/components/runtime/runtime-icons';

export const JavaRuntime = () => {
  const { t } = useTranslation();
  const { data: installed } = useInstalledVersions('java');
  const { data: defaultVersion } = useDefaultVersion('java');
  const currentVersion = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="space-y-6 p-6">
      <RuntimeHeader
        icon={<JavaIcon className="size-5" />}
        name="Java"
        version={currentVersion}
        actions={
          currentVersion ? (
            <Badge variant="outline">{t('Common', 'DefaultValue', { value: currentVersion })}</Badge>
          ) : undefined
        }
      />
      <JavaDetail version={currentVersion || 'latest'} />
    </div>
  );
};
