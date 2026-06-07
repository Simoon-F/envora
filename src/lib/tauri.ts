import { invoke } from '@tauri-apps/api/core';

/**
 * Typed wrapper around Tauri invoke
 */
export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}
