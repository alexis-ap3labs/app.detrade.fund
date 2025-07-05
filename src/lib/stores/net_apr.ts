import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { browser } from '$app/environment';

// Store for managing net APR data by vault
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
  fetchNetApr: (vaultId: string) => Promise<void>;
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
    // Fetch net APR data for a vault
    fetchNetApr: async (vaultId: string) => {
      if (!browser) return;
      
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          loading: true,
          error: null
        }
      }));

      try {
        const response = await fetch(`/api/vaults/${vaultId}/metrics/net_apr`);
        if (!response.ok) {
          throw new Error('Failed to fetch net APR');
        }
        const data = await response.json();
        update(store => ({
          ...store,
          [vaultId]: {
            ...store[vaultId],
            data,
            loading: false,
            error: null
          }
        }));
      } catch (error) {
        console.error('Error fetching net APR:', error);
        update(store => ({
          ...store,
          [vaultId]: {
            ...store[vaultId],
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch net APR'
          }
        }));
      }
    },
    reset: () => set({})
  };
}

export const netApr = createNetAprStore(); 