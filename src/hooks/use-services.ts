import { useTauriSwr } from './use-swr';
import { useTauriMutation } from './use-mutation';
import type { ServiceInfo } from '@/types/service';

export interface ServiceLogSection {
  path: string;
  name: string;
  content: string;
  exists: boolean;
}

export function useAllServices() {
  return useTauriSwr<ServiceInfo[]>(
    'get_all_services',
    undefined,
    { refreshInterval: 5000 }
  );
}

export function useStartService() {
  return useTauriMutation<ServiceInfo, { serviceType: string; version: string }>(
    'start_service'
  );
}

export function useStopService() {
  return useTauriMutation<void, { serviceId: string }>(
    'stop_service'
  );
}

export function useRestartService() {
  return useTauriMutation<void, { serviceId: string }>(
    'restart_service'
  );
}

export function useStartAllServices() {
  return useTauriMutation<ServiceInfo[], Record<string, never>>(
    'start_all_services'
  );
}

export function useStopAllServices() {
  return useTauriMutation<void, Record<string, never>>(
    'stop_all_services'
  );
}

export function useServiceLog(serviceType: string | null, version: string | null) {
  return useTauriSwr<ServiceLogSection[]>(
    serviceType && version ? 'get_service_log' : null,
    serviceType && version ? { serviceType, version } : undefined
  );
}

export function useClearServiceLog() {
  return useTauriMutation<void, { serviceType: string; version: string }>(
    'clear_service_log'
  );
}
