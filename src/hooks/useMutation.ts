import { useState, useCallback } from 'react';
import { tauriInvoke } from '@/lib/tauri';

interface UseMutationResult<T, A extends Record<string, unknown>> {
  mutate: (args: A) => Promise<T>;
  data: T | null;
  error: string | null;
  isLoading: boolean;
  reset: () => void;
}

/**
 * Generic mutation hook for Tauri invoke calls
 */
export function useTauriMutation<T, A extends Record<string, unknown> = Record<string, unknown>>(
  command: string
): UseMutationResult<T, A> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mutate = useCallback(
    async (args: A): Promise<T> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await tauriInvoke<T>(command, args as Record<string, unknown>);
        setData(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [command]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, data, error, isLoading, reset };
}
