import useSWR, { type SWRConfiguration } from 'swr';
import { tauriInvoke } from '@/lib/tauri';

/**
 * Generic SWR hook for Tauri invoke calls
 */
export function useTauriSwr<T>(
  command: string | null,
  args?: Record<string, unknown>,
  config?: SWRConfiguration<T>
) {
  return useSWR<T>(
    command ? [command, args] : null,
    ([cmd, cmdArgs]) => tauriInvoke<T>(cmd, cmdArgs as Record<string, unknown>),
    {
      revalidateOnFocus: false,
      ...config,
    }
  );
}
