import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

interface NetAprData {
  apr: number | null;
  startDate: string;
  endDate: string;
  totalReturn: number;
  timestamp: string;
}

interface NetAprStore extends Writable<{
  [vaultId: string]: {
    data: NetAprData | null;
    loading: boolean;
    error: string | null;
  };
}> {
  setApr: (vaultId: string, data: NetAprData) => void;
  setLoading: (vaultId: string, loading: boolean) => void;
  setError: (vaultId: string, error: string | null) => void;
  reset: () => void;
}

function createNetAprStore(): NetAprStore {
  const { subscribe, set, update } = writable<{
    [vaultId: string]: {
      data: NetAprData | null;
      loading: boolean;
      error: string | null;
    };
  }>({});

  return {
    subscribe,
    set,
    update,
    setApr: (vaultId: string, data: NetAprData) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          data,
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
          error,
          loading: false
        }
      }));
    },
    reset: () => set({})
  };
}

export const netApr = createNetAprStore(); 