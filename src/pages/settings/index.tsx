import { useTauriMutation } from '@/hooks/use-mutation';
import { useTauriSwr } from '@/hooks/use-swr';
import { useThemeStore } from '@/stores/theme';
import type { AppSettings, ShellEnvironmentStatus, Theme } from '@/types/settings';
import { AboutSettings } from './components/about-settings';
import { AppearanceSettings } from './components/appearance-settings';
import { PathSettings } from './components/path-settings';
import { ShellEnvironmentSettings } from './components/shell-environment-settings';

export const Settings = () => {
  const { theme, setTheme } = useThemeStore();
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
    <div className="max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">设置</h1>
      <AppearanceSettings theme={theme} onThemeChange={handleThemeChange} />
      <PathSettings settings={settings} isLoading={isLoading} />
      <ShellEnvironmentSettings
        binDir={settings?.bin_dir}
        shellEnv={shellEnv}
        isInstalling={isInstallingShellEnv}
        onInstall={handleInstallShellEnv}
      />
      <AboutSettings />
    </div>
  );
};
