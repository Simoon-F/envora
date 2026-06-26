import { Check, Languages } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/i18n/use-translation';
import { cn } from '@/lib/utils';
import type { Language } from '@/i18n/translations';

const languages: Language[] = ['en', 'zh'];

export const LanguageSettings = () => {
  const { language, languageNames, setLanguage, t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Languages className="size-4" />
          {t('Settings', 'Language')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Label>{t('Settings', 'LanguageDescription')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {languages.map((item) => {
              const active = language === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLanguage(item)}
                  className={cn(
                    'group relative flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 transition-colors duration-200',
                    active
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-card hover:bg-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'text-sm',
                      active ? 'font-medium text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  >
                    {languageNames[item]}
                  </span>
                  {active && (
                    <Check className="size-3.5 text-primary" />
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
