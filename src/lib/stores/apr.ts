import { writable } from 'svelte/store';

export interface AprData {
  apr: number;
  history: {
    date: string;
    pps: number;
    apr: number;
  }[];
  timestamp: string;
}

interface AprStore {
  [vaultId: string]: AprData;
}

function createAprStore() {
  const { subscribe, set, update } = writable<AprStore>({});

  return {
    subscribe,
    setApr: (vaultId: string, data: AprData) => {
      update(store => ({
        ...store,
        [vaultId]: data
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
    reset: () => set({}),
    refreshPps: async (vaultId: string) => {
      // Call the API and update the store as needed
    }
  };
}

export const apr = createAprStore(); 