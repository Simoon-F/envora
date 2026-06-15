export type Theme = 'light' | 'dark' | 'system';

export interface AppSettings {
  data_dir: string;
  runtime_dir: string;
  bin_dir: string;
  log_dir: string;
  default_versions: Record<string, string>;
  auto_start_services: boolean;
  theme: Theme;
}

export interface ShellEnvironmentStatus {
  bin_dir: string;
  env_script: string;
  shell_profile: string;
  profile_installed: boolean;
  user_path_installed: boolean;
  is_installed: boolean;
}
