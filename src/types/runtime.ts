export type RuntimeType = 'php' | 'nginx' | 'mysql' | 'java';

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
