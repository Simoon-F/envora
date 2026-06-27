import { useState } from 'react';
import { useTauriMutation } from '@/hooks/use-mutation';
import { useTauriSwr } from '@/hooks/use-swr';
import { useThemeStore } from '@/stores/theme';
import type { AppSettings, ShellEnvironmentStatus, Theme } from '@/types/settings';
import { AboutSettings } from './components/about-settings';
import { AppearanceSettings } from './components/appearance-settings';
import { LanguageSettings } from './components/language-settings';
import { PathSettings } from './components/path-settings';
import { ShellEnvironmentSettings } from './components/shell-environment-settings';
import { useTranslation } from '@/i18n/use-translation';
import { cn } from '@/lib/utils';

const navItems = [
  { id: 'appearance', label: 'Appearance' as const },
  { id: 'language', label: 'Language' as const },
  { id: 'paths', label: 'Path' as const },
  { id: 'shell-env', label: 'ShellEnvironment' as const },
  { id: 'about', label: 'About' as const },
];

export const Settings = () => {
  const { theme, setTheme } = useThemeStore();
  const { t } = useTranslation();
  const { data: settings, isLoading } = useTauriSwr<AppSettings>('get_settings');
  const { data: shellEnv, mutate: refreshShellEnv } =
    useTauriSwr<ShellEnvironmentStatus>('get_shell_environment_status');
  const { mutate: updateSettings } = useTauriMutation('update_settings');
  const { mutate: installShellEnv, isLoading: isInstallingShellEnv } =
    useTauriMutation<ShellEnvironmentStatus>('install_shell_environment');

  const [activeSection, setActiveSection] = useState('appearance');

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    updateSettings({ theme: newTheme });
  };

  const handleInstallShellEnv = async () => {
    await installShellEnv({});
    refreshShellEnv();
  };

  return (
    <div className="flex h-full">
      {/* Settings sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="flex-1 overflow-auto p-3">
          <h2 className="px-2.5 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {t('Settings', 'Settings')}
          </h2>
          <nav className="space-y-0.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  'sidebar-nav-link',
                  activeSection === item.id ? 'sidebar-nav-link-active' : '',
                )}
              >
                {t('Settings', item.label)}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Settings content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl space-y-5 p-5">
          {activeSection === 'appearance' && (
            <section>
              <h1 className="text-lg font-semibold tracking-tight">{t('Settings', 'Appearance')}</h1>
              <AppearanceSettings theme={theme} onThemeChange={handleThemeChange} />
            </section>
          )}
          {activeSection === 'language' && (
            <section>
              <h1 className="text-lg font-semibold tracking-tight">{t('Settings', 'Language')}</h1>
              <LanguageSettings />
            </section>
          )}
          {activeSection === 'paths' && (
            <section>
              <h1 className="text-lg font-semibold tracking-tight">{t('Settings', 'Path')}</h1>
              <PathSettings settings={settings} isLoading={isLoading} />
            </section>
          )}
          {activeSection === 'shell-env' && (
            <section>
              <h1 className="text-lg font-semibold tracking-tight">{t('Settings', 'ShellEnvironment')}</h1>
              <ShellEnvironmentSettings
                binDir={settings?.bin_dir}
                shellEnv={shellEnv}
                isInstalling={isInstallingShellEnv}
                onInstall={handleInstallShellEnv}
              />
            </section>
          )}
          {activeSection === 'about' && (
            <section>
              <h1 className="text-lg font-semibold tracking-tight">{t('Settings', 'About')}</h1>
              <AboutSettings />
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
