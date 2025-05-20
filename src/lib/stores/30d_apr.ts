import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

interface ThirtyDayAprData {
  apr: number | null;
  timestamp: string;
}

interface ThirtyDayAprStore extends Writable<{
  [vaultId: string]: {
    data: ThirtyDayAprData | null;
    loading: boolean;
    error: string | null;
  };
}> {
  setApr: (vaultId: string, data: ThirtyDayAprData) => void;
  setLoading: (vaultId: string, loading: boolean) => void;
  setError: (vaultId: string, error: string | null) => void;
  reset: () => void;
}

function createThirtyDayAprStore(): ThirtyDayAprStore {
  const { subscribe, set, update } = writable<{
    [vaultId: string]: {
      data: ThirtyDayAprData | null;
      loading: boolean;
      error: string | null;
    };
  }>({});

  return {
    subscribe,
    set,
    update,
    setApr: (vaultId: string, data: ThirtyDayAprData) => {
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

export const thirtyDayApr = createThirtyDayAprStore(); 