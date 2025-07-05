import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Store for managing 7-day APR data by vault
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
    // Fetch 7-day APR data for a vault
    fetchSevenDayApr: async (vaultId: string) => {
      if (!browser) return;

      update(store => ({
        ...store,
        [vaultId]: {
          data: null,
          error: null,
          loading: true
        }
      }));

      try {
        const response = await fetch(`/api/vaults/${vaultId}/metrics/7d_apr`);
        if (!response.ok) {
          throw new Error('Failed to fetch 7-day APR');
        }
        const data = await response.json();
        update(store => ({
          ...store,
          [vaultId]: {
            data: {
              apr: data.apr,
              timestamp: new Date().toISOString()
            },
            error: null,
            loading: false
          }
        }));
      } catch (error) {
        console.error('Error fetching 7-day APR:', error);
        update(store => ({
          ...store,
          [vaultId]: {
            data: null,
            error: error instanceof Error ? error.message : 'Failed to fetch 7-day APR',
            loading: false
          }
        }));
      }
    },
    reset: () => set({})
  };
}

export const sevenDayApr = createSevenDayAprStore(); 