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
