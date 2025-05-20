import { writable } from 'svelte/store';

export interface PpsData {
  pps: number;
  timestamp: string;
  loading: boolean;
  error: string | null;
}

export interface PpsHistoryData {
  timestamp: string;
  pps: string;
  ppsFormatted: number;
}

export interface PpsHistoryResponse {
  pps: PpsHistoryData[];
}

interface PpsStore {
  [vaultId: string]: {
    data: PpsData;
    history: PpsHistoryData[];
    currentTimeframe: 'all' | '3m' | '1m' | '1w';
  };
}

function createPpsStore() {
  const { subscribe, set, update } = writable<PpsStore>({});

  return {
    subscribe,
    setPps: (vaultId: string, data: PpsData) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          data: {
            ...data,
            loading: false,
            error: null
          }
        }
      }));
    },
    setHistory: (vaultId: string, history: PpsHistoryData[], timeframe: 'all' | '3m' | '1m' | '1w') => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          history,
          currentTimeframe: timeframe
        }
      }));
    },
    setLoading: (vaultId: string, loading: boolean) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          data: {
            ...store[vaultId]?.data,
            loading
          }
        }
      }));
    },
    setError: (vaultId: string, error: string | null) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          data: {
            ...store[vaultId]?.data,
            error
          }
        }
      }));
    },
    getPpsHistory: async (vaultId: string, timeframe: 'all' | '3m' | '1m' | '1w'): Promise<PpsHistoryResponse> => {
      try {
        const response = await fetch(`/api/vaults/${vaultId}/metrics/pps?time=${timeframe}`);
        if (!response.ok) {
          throw new Error('Failed to fetch PPS history');
        }
        const data = await response.json();
        
        update(store => {
          const currentStore = store[vaultId] || {
            data: { pps: 0, timestamp: '', loading: false, error: null },
            history: [],
            currentTimeframe: timeframe
          };

          return {
            ...store,
            [vaultId]: {
              ...currentStore,
              history: data.pps,
              currentTimeframe: timeframe
            }
          };
        });
        
        return data;
      } catch (error) {
        console.error('Error fetching PPS history:', error);
        return { pps: [] };
      }
    },
    getLatestPps: async (vaultId: string): Promise<PpsHistoryData | null> => {
      const history = await pps.getPpsHistory(vaultId, 'all');
      if (history.pps.length === 0) return null;
      return history.pps[history.pps.length - 1];
    },
    reset: () => set({})
  };
}

export const pps = createPpsStore(); 