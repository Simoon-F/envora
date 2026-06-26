import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/i18n/use-translation';
import { APP_VERSION } from '@/lib/version';
import { BrandMark } from '@/components/layout/brand-mark';

export const AboutSettings = () => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Settings', 'About')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-primary">
            <BrandMark className="size-5" />
          </span>
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">Envora <span className="font-mono text-xs tabular-nums text-muted-foreground">v{APP_VERSION}</span></p>
            <p className="text-muted-foreground">{t('Settings', 'Description')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
