import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/i18n/use-translation';
import { APP_VERSION } from '@/lib/version';

export const AboutSettings = () => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Settings', 'About')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Envora v{APP_VERSION}</p>
          <p>{t('Settings', 'Description')}</p>
        </div>
      </CardContent>
    </Card>
  );
};
