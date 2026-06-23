import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
          <Languages className="h-4 w-4" />
          {t('Settings', 'Language')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Label>{t('Settings', 'LanguageDescription')}</Label>
          <div className="flex gap-2">
            {languages.map((item) => (
              <Button
                key={item}
                variant={language === item ? 'default' : 'outline'}
                size="sm"
                className={cn('flex-1', language === item && 'ring-2 ring-primary')}
                onClick={() => setLanguage(item)}
              >
                {languageNames[item]}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
