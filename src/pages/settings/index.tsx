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
import { PageContainer } from '@/components/layout/page-container';

export const Settings = () => {
  const { theme, setTheme } = useThemeStore();
  const { t } = useTranslation();
  const { data: settings, isLoading } = useTauriSwr<AppSettings>('get_settings');
  const { data: shellEnv, mutate: refreshShellEnv } =
    useTauriSwr<ShellEnvironmentStatus>('get_shell_environment_status');
  const { mutate: updateSettings } = useTauriMutation('update_settings');
  const { mutate: installShellEnv, isLoading: isInstallingShellEnv } =
    useTauriMutation<ShellEnvironmentStatus>('install_shell_environment');

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    updateSettings({ theme: newTheme });
  };

  const handleInstallShellEnv = async () => {
    await installShellEnv({});
    refreshShellEnv();
  };

  return (
    <PageContainer title={t('Settings', 'Settings')} maxWidth="narrow">
      <AppearanceSettings theme={theme} onThemeChange={handleThemeChange} />
      <LanguageSettings />
      <PathSettings settings={settings} isLoading={isLoading} />
      <ShellEnvironmentSettings
        binDir={settings?.bin_dir}
        shellEnv={shellEnv}
        isInstalling={isInstallingShellEnv}
        onInstall={handleInstallShellEnv}
      />
      <AboutSettings />
    </PageContainer>
  );
};
