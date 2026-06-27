import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/i18n/use-translation';
import type { AppSettings } from '@/types/settings';

interface PathSettingsProps {
  settings: AppSettings | undefined;
  isLoading: boolean;
}

export const PathSettings = ({ settings, isLoading }: PathSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Card size="sm" className="card-subtle mt-4">
      <CardContent className="p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('Common', 'Loading')}</p>
        ) : settings ? (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">{t('Settings', 'DataDirectory')}</Label>
              <p className="mt-1 rounded-md bg-code-bg px-2 py-1.5 font-mono text-xs break-all">{settings.data_dir}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('Settings', 'RuntimeDirectory')}</Label>
              <p className="mt-1 rounded-md bg-code-bg px-2 py-1.5 font-mono text-xs break-all">{settings.runtime_dir}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('Settings', 'BinDirectory')}</Label>
              <p className="mt-1 rounded-md bg-code-bg px-2 py-1.5 font-mono text-xs break-all">{settings.bin_dir}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
