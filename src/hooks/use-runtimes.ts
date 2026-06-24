import { useTauriSwr } from './use-swr';
import { useTauriMutation } from './use-mutation';
import type {
  GoCacheStatus,
  GoEnvStatus,
  GoEnvUpdate,
  GoSdkRepairStatus,
  GoToolsStatus,
  NodePackageManagerName,
  NodePackageManagerStatus,
  RuntimeVersion,
  VersionInfo,
} from '@/types/runtime';
import type { OperationInfo } from '@/stores/operations';

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

export function useStartRuntimeInstall() {
  return useTauriMutation<OperationInfo, { runtime: string; version: string }>(
    'start_runtime_install'
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

export function useNodePackageManagerStatus(projectDir?: string | null) {
  return useTauriSwr<NodePackageManagerStatus>(
    'get_node_package_manager_status',
    { projectDir: projectDir || null }
  );
}

export function useSetCorepackEnabled() {
  return useTauriMutation<NodePackageManagerStatus, { enabled: boolean }>(
    'set_corepack_enabled'
  );
}

export function useInstallNodePackageManager() {
  return useTauriMutation<
    NodePackageManagerStatus,
    { manager: NodePackageManagerName; version?: string | null }
  >('install_node_package_manager');
}

export function useInstallProjectPackageManager() {
  return useTauriMutation<NodePackageManagerStatus, { projectDir: string }>(
    'install_project_package_manager'
  );
}

export function useGoEnvStatus() {
  return useTauriSwr<GoEnvStatus>(
    'get_go_env_status'
  );
}

export function useUpdateGoEnv() {
  return useTauriMutation<GoEnvStatus, { update: GoEnvUpdate }>(
    'update_go_env'
  );
}

export function useGoToolsStatus() {
  return useTauriSwr<GoToolsStatus>(
    'get_go_tools_status'
  );
}

export function useInstallGoTool() {
  return useTauriMutation<GoToolsStatus, { name: string; version?: string | null }>(
    'install_go_tool'
  );
}

export function useGoCacheStatus() {
  return useTauriSwr<GoCacheStatus>(
    'get_go_cache_status'
  );
}

export function useClearGoCache() {
  return useTauriMutation<GoCacheStatus, { target: string }>(
    'clear_go_cache'
  );
}

export function useRepairGoSdk() {
  return useTauriMutation<GoSdkRepairStatus, Record<string, never>>(
    'repair_go_sdk'
  );
}
