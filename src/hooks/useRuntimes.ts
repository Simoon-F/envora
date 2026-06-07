import { useTauriSwr } from './useSwr';
import { useTauriMutation } from './useMutation';
import type { RuntimeVersion, VersionInfo } from '@/types/runtime';

export function useInstalledVersions(runtime: string) {
  return useTauriSwr<RuntimeVersion[]>(
    'list_installed_versions',
    { runtime }
  );
}

export function useAvailableVersions(runtime: string) {
  return useTauriSwr<VersionInfo[]>(
    'list_available_versions',
    { runtime }
  );
}

export function useDefaultVersion(runtime: string) {
  return useTauriSwr<string | null>(
    'get_default_version',
    { runtime }
  );
}

export function useInstallVersion() {
  return useTauriMutation<void, { runtime: string; version: string }>(
    'install_version'
  );
}

export function useUninstallVersion() {
  return useTauriMutation<void, { runtime: string; version: string }>(
    'uninstall_version'
  );
}

export function useSwitchDefault() {
  return useTauriMutation<void, { runtime: string; version: string }>(
    'switch_default_version'
  );
}
