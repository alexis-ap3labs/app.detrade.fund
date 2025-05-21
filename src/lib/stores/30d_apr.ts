import { writable } from 'svelte/store';
import { browser } from '$app/environment';
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
  fetchThirtyDayApr: (vaultId: string) => Promise<void>;
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
    fetchThirtyDayApr: async (vaultId: string) => {
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
        const response = await fetch(`/api/vaults/${vaultId}/metrics/30d_apr`);
        if (!response.ok) {
          throw new Error('Failed to fetch 30-day APR');
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
        console.error('Error fetching 30-day APR:', error);
        update(store => ({
          ...store,
          [vaultId]: {
            data: null,
            error: error instanceof Error ? error.message : 'Failed to fetch 30-day APR',
            loading: false
          }
        }));
      }
    },
    reset: () => set({})
  };
}

export const thirtyDayApr = createThirtyDayAprStore(); 