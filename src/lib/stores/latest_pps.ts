import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

// Store for managing latest PPS (Price Per Share) data by vault
export interface LatestPpsData {
  timestamp: string;
  pps: string;
}

export interface LatestPpsStore {
  [vaultId: string]: {
    data: LatestPpsData | null;
    loading: boolean;
    error: string | null;
  };
}

function createLatestPpsStore() {
  const { subscribe, set, update } = writable<LatestPpsStore>({});

  return {
    subscribe,
    setLatestPps: (vaultId: string, data: LatestPpsData) => {
      update(store => ({
        ...store,
        [vaultId]: {
          data,
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
    reset: () => {
      set({});
    }
  };
}

export const latestPps = createLatestPpsStore(); 