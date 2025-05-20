import { writable } from 'svelte/store';

type AprData = {
  data: {
    apr: number;
    timestamp: string;
  } | null;
  error: string | null;
  loading: boolean;
};

type AprStore = {
  [vaultId: string]: AprData;
};

function createSevenDayAprStore() {
  const { subscribe, set, update } = writable<AprStore>({});

  return {
    subscribe,
    setApr: (vaultId: string, apr: number, timestamp: string) => {
      update(store => ({
        ...store,
        [vaultId]: {
          data: { apr, timestamp },
          error: null,
          loading: false
        }
      }));
    },
    setError: (vaultId: string, error: string) => {
      update(store => ({
        ...store,
        [vaultId]: {
          data: null,
          error,
          loading: false
        }
      }));
    },
    setLoading: (vaultId: string) => {
      update(store => ({
        ...store,
        [vaultId]: {
          data: null,
          error: null,
          loading: true
        }
      }));
    },
    reset: () => set({})
  };
}

export const sevenDayApr = createSevenDayAprStore(); 