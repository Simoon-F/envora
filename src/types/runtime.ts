export type RuntimeType = 'php' | 'nginx' | 'mysql' | 'java' | 'node' | 'go';

export interface VersionInfo {
  version: string;
  download_url: string | null;
  size: number | null;
  sha256: string | null;
  is_installed: boolean;
  is_default: boolean;
}

export interface RuntimeVersion {
  version: string;
  install_dir: string;
  installed_at: string;
  size: number;
  is_default: boolean;
}

export type NodePackageManagerName = 'pnpm' | 'yarn';

export interface NodeToolStatus {
  name: string;
  version: string | null;
  path: string | null;
  available: boolean;
}

export interface ProjectPackageManager {
  name: string;
  version: string | null;
  raw: string;
  package_json_path: string;
}

export interface NodePackageManagerStatus {
  node_version: string | null;
  default_node_version: string | null;
  bin_dir: string;
  corepack_enabled: boolean;
  tools: NodeToolStatus[];
  project_dir: string | null;
  project_package_manager: ProjectPackageManager | null;
}

export interface GoEnvStatus {
  go_version: string | null;
  default_go_version: string | null;
  go_executable: string | null;
  bin_dir: string;
  goenv: string | null;
  envora_goenv: string;
  goroot: string | null;
  gopath: string | null;
  envora_gopath: string;
  gomodcache: string | null;
  envora_gomodcache: string;
  gocache: string | null;
  envora_gocache: string;
  gobin: string | null;
  goproxy: string | null;
  gosumdb: string | null;
  gonosumdb: string | null;
  goprivate: string | null;
}

export interface GoEnvUpdate {
  gopath?: string | null;
  gomodcache?: string | null;
  gocache?: string | null;
  gobin?: string | null;
  goproxy?: string | null;
  gosumdb?: string | null;
  gonosumdb?: string | null;
  goprivate?: string | null;
}

export interface GoToolStatus {
  name: string;
  label: string;
  description: string;
  package: string;
  installed: boolean;
  version: string | null;
  path: string | null;
}

export interface GoToolsStatus {
  default_go_version: string | null;
  tools_bin_dir: string;
  tools: GoToolStatus[];
}

export interface GoCacheStatus {
  gomodcache: string | null;
  gomodcache_size: number;
  gocache: string | null;
  gocache_size: number;
  gotmpdir: string | null;
}

export interface GoSdkRepairStatus {
  default_go_version: string;
  go_executable: string;
  bin_dir: string;
  tools_bin_dir: string;
}

export type BuildStage =
  | 'downloading'
  | 'extracting'
  | 'configuring'
  | 'compiling'
  | 'installing'
  | 'post_install';

export interface BuildProgressEvent {
  type: 'build_progress';
  payload: {
    runtime: string;
    version: string;
    stage: BuildStage;
    message: string;
    percent: number;
  };
}

export interface DownloadProgressEvent {
  type: 'download_progress';
  payload: {
    runtime: string;
    version: string;
    percent: number;
    downloaded_bytes: number;
    total_bytes: number;
  };
}

export type ProgressEvent = BuildProgressEvent | DownloadProgressEvent;
