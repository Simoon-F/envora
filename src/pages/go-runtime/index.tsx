import { Badge } from '@/components/ui/badge';
import { GoLogo } from '@/components/runtime/go-logo';
import { GoDetail } from './components/go-detail';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';

export const GoRuntime = () => {
  const { t } = useTranslation();
  const { data: installed } = useInstalledVersions('go');
  const { data: defaultVersion } = useDefaultVersion('go');
  const currentVersion = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <GoLogo className="h-8 w-20" />
        {currentVersion && <Badge variant="outline">{t('Common', 'DefaultValue', { value: currentVersion })}</Badge>}
      </div>

      <GoDetail version={currentVersion || 'latest'} />
    </div>
  );
};
