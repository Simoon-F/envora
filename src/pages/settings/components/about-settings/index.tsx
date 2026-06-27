import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from '@/i18n/use-translation';
import { APP_VERSION } from '@/lib/version';
import { BrandMark } from '@/components/layout/brand-mark';

export const AboutSettings = () => {
  const { t } = useTranslation();

  return (
    <Card size="sm" className="card-subtle mt-4">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
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
