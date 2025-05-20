import { writable } from 'svelte/store';

export interface VaultMetrics {
  pps: number;
  timestamp: string;
  loading: boolean;
  error: string | null;
}

interface MetricsStore {
  [vaultId: string]: VaultMetrics;
}

function createMetricsStore() {
  const { subscribe, set, update } = writable<MetricsStore>({});

  return {
    subscribe,
    setMetrics: (vaultId: string, data: VaultMetrics) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...data,
          loading: false,
          error: null
        }
      }));
    },
    setLoading: (vaultId: string, loading: boolean) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          loading
        }
      }));
    },
    setError: (vaultId: string, error: string | null) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          error
        }
      }));
    },
    reset: () => set({})
  };
}

export const metrics = createMetricsStore(); 