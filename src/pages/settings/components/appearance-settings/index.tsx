import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/i18n/use-translation';
import { cn } from '@/lib/utils';
import type { Theme } from '@/types/settings';
import { Monitor, Moon, Sun } from 'lucide-react';

const themeOptions = [
  { value: 'light', labelKey: 'Light', icon: Sun },
  { value: 'dark', labelKey: 'Dark', icon: Moon },
  { value: 'system', labelKey: 'System', icon: Monitor },
] as const satisfies readonly { value: Theme; labelKey: string; icon: typeof Sun }[];

interface AppearanceSettingsProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export const AppearanceSettings = ({ theme, onThemeChange }: AppearanceSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Settings', 'Appearance')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Label>{t('Settings', 'Theme')}</Label>
          <div className="flex gap-2">
            {themeOptions.map(({ value, labelKey, icon: Icon }) => (
              <Button
                key={value}
                variant={theme === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => onThemeChange(value)}
                className={cn('flex-1', theme === value && 'ring-2 ring-primary')}
              >
                <Icon className="mr-2 h-4 w-4" />
                {t('Settings', labelKey)}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
