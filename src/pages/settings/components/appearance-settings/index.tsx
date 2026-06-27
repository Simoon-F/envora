import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/i18n/use-translation';
import { cn } from '@/lib/utils';
import type { Theme } from '@/types/settings';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

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
    <Card size="sm" className="card-subtle mt-4">
      <CardContent className="p-5">
        <div className="space-y-3">
          <Label>{t('Settings', 'Theme')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map(({ value, labelKey, icon: Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onThemeChange(value)}
                  className={cn(
                    'group relative flex flex-col items-center gap-2 rounded-lg border px-3 py-3 transition-colors duration-200',
                    active
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-card hover:bg-accent/40',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-5 transition-colors',
                      active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs',
                      active ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t('Settings', labelKey)}
                  </span>
                  {active && (
                    <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
