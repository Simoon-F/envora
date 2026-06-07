import { useTauriSwr } from './useSwr';
import { useTauriMutation } from './useMutation';
import type { ServiceInfo } from '@/types/service';

export function useAllServices() {
  return useTauriSwr<ServiceInfo[]>(
    'get_all_services',
    undefined,
    { refreshInterval: 5000 }
  );
}

export function useStartService() {
  return useTauriMutation<ServiceInfo, { service_type: string; version: string }>(
    'start_service'
  );
}

export function useStopService() {
  return useTauriMutation<void, { service_id: string }>(
    'stop_service'
  );
}

export function useRestartService() {
  return useTauriMutation<void, { service_id: string }>(
    'restart_service'
  );
}
