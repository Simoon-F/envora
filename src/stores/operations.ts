import { create } from 'zustand';

export type OperationStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface OperationTarget {
  runtime?: string | null;
  tool?: string | null;
  version?: string | null;
}

export interface OperationInfo {
  id: string;
  kind: string;
  target: OperationTarget;
  status: OperationStatus;
  stage: string;
  message: string;
  percent: number;
  error?: string | null;
  started_at: string;
  updated_at: string;
}

interface OperationsStore {
  operations: Record<string, OperationInfo>;
  hydrate: (operations: OperationInfo[]) => void;
  upsert: (operation: OperationInfo) => void;
  remove: (id: string) => void;
  upsertLegacyProgress: (payload: LegacyProgressPayload) => void;
}

export interface LegacyProgressPayload {
  runtime: string;
  version: string;
  stage?: string;
  message?: string;
  percent?: number;
}

function nowIso() {
  return new Date().toISOString();
}

export function legacyOperationId(runtime: string, version: string) {
  return `legacy:${runtime}:${version}`;
}

export const useOperationsStore = create<OperationsStore>((set) => ({
  operations: {},
  hydrate: (operations) =>
    set((state) => ({
      operations: {
        ...state.operations,
        ...Object.fromEntries(operations.map((operation) => [operation.id, operation])),
      },
    })),
  upsert: (operation) =>
    set((state) => ({
      operations: {
        ...state.operations,
        [operation.id]: operation,
      },
    })),
  remove: (id) =>
    set((state) => {
      const { [id]: _removed, ...operations } = state.operations;
      return { operations };
    }),
  upsertLegacyProgress: (payload) =>
    set((state) => {
      const id = legacyOperationId(payload.runtime, payload.version);
      const current = state.operations[id];
      const percent = payload.percent ?? current?.percent ?? 0;
      const timestamp = nowIso();
      const status: OperationStatus = percent >= 100 ? 'completed' : 'running';
      return {
        operations: {
          ...state.operations,
          [id]: {
            id,
            kind: payload.runtime === 'composer' ? 'tool_install' : 'runtime_install',
            target: {
              runtime: payload.runtime === 'composer' ? null : payload.runtime,
              tool: payload.runtime === 'composer' ? 'composer' : null,
              version: payload.version,
            },
            status,
            stage: payload.stage || current?.stage || 'running',
            message: payload.message || current?.message || '处理中...',
            percent,
            error: null,
            started_at: current?.started_at || timestamp,
            updated_at: timestamp,
          },
        },
      };
    }),
}));
