import en from './locales/en.json';
import zh from './locales/zh.json';

export type Language = 'en' | 'zh';

export type TranslationSchema = typeof en;

export type TranslationPage = Extract<keyof TranslationSchema, string>;

export type TranslationName<Page extends TranslationPage> = Extract<keyof TranslationSchema[Page], string>;

export type TranslationKey = {
  [Page in TranslationPage]: `${Page}.${TranslationName<Page>}`;
}[TranslationPage];

export const translations = {
  en,
  zh,
} satisfies Record<Language, TranslationSchema>;

export const languageNames: Record<Language, string> = {
  en: en.Common.LanguageName,
  zh: zh.Common.LanguageName,
};
