export type ServiceStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping' | 'unknown';

export interface ServiceInfo {
  id: string;
  name: string;
  status: ServiceStatus;
  pid: number | null;
  port: number | null;
}
