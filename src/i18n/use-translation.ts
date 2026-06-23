import { useCallback } from 'react';
import { useI18nStore } from './store';
import {
  languageNames,
  translations,
  type Language,
  type TranslationKey,
  type TranslationName,
  type TranslationPage,
} from './translations';

type Params = Record<string, string | number>;

type TranslationFunction = {
  <Key extends TranslationKey>(key: Key, params?: Params): string;
  <Page extends TranslationPage, Name extends TranslationName<Page>>(
    page: Page,
    name: Name,
    params?: Params,
  ): string;
};

const interpolate = (value: string, params?: Params) => {
  if (!params) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ''));
};

export const useTranslation = () => {
  const language = useI18nStore((state) => state.language);
  const setLanguage = useI18nStore((state) => state.setLanguage);

  const t = useCallback(
    (pageOrKey: TranslationPage | TranslationKey, nameOrParams?: string | Params, maybeParams?: Params) => {
      const hasDottedKey = pageOrKey.includes('.');
      const [page, name] = hasDottedKey
        ? (pageOrKey.split('.', 2) as [TranslationPage, string])
        : [pageOrKey as TranslationPage, nameOrParams as string];
      const params = hasDottedKey ? (nameOrParams as Params | undefined) : maybeParams;
      const currentMessages = translations[language][page] as Record<string, string> | undefined;
      const fallbackMessages = translations.en[page] as Record<string, string> | undefined;
      const value = currentMessages?.[name] ?? fallbackMessages?.[name] ?? name;
      return interpolate(value, params);
    },
    [language],
  ) as TranslationFunction;

  return {
    language,
    languageNames,
    setLanguage: setLanguage as (language: Language) => void,
    t,
  };
};
