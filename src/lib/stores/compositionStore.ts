import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

export interface Allocation {
  percentage: number;
  value_usdc: string;
}

export interface Composition {
  _id: string;
  timestamp: string;
  total_value_usdc: string;
  allocation: Record<string, Allocation>;
}

export interface CompositionStore {
  compositions: Record<string, Composition | undefined>;
  loading: boolean;
  error: string | null;
}

function createCompositionStore() {
  const { subscribe, set, update } = writable<CompositionStore>({
    compositions: {},
    loading: false,
    error: null
  });

  return {
    subscribe,
    setComposition: (vaultId: string, composition: Composition | undefined) => {
      update(store => ({
        ...store,
        compositions: {
          ...store.compositions,
          [vaultId]: composition
        },
        error: null
      }));
    },
    setLoading: (loading: boolean) => {
      update(store => ({ ...store, loading }));
    },
    setError: (error: string | null) => {
      update(store => ({ ...store, error }));
    },
    reset: () => {
      set({
        compositions: {},
        loading: false,
        error: null
      });
    }
  };
}

export const compositionStore = createCompositionStore(); 