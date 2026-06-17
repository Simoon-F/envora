import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { tauriInvoke } from '@/lib/tauri';
import { type LegacyProgressPayload, type OperationInfo, useOperationsStore } from '@/stores/operations';

const unwrapProgress = (payload: LegacyProgressPayload | { payload: LegacyProgressPayload }): LegacyProgressPayload => {
  return 'payload' in payload ? payload.payload : payload;
};

export const OperationEvents = () => {
  useEffect(() => {
    let unlistenOperation: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    const store = useOperationsStore.getState();

    tauriInvoke<OperationInfo[]>('list_operations')
      .then((operations) => store.hydrate(operations))
      .catch(() => undefined);

    listen<OperationInfo>('envora://operation', (event) => {
      store.upsert(event.payload);
    }).then((fn) => {
      unlistenOperation = fn;
    });

    listen<LegacyProgressPayload | { payload: LegacyProgressPayload }>('envora://progress', (event) => {
      const payload = unwrapProgress(event.payload);
      if (!payload.runtime || !payload.version) return;
      store.upsertLegacyProgress(payload);
    }).then((fn) => {
      unlistenProgress = fn;
    });

    return () => {
      unlistenOperation?.();
      unlistenProgress?.();
    };
  }, []);

  return null;
};
