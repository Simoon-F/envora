import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from './translations';

interface I18nState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'envora-language',
    },
  ),
);
