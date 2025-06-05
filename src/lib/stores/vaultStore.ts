import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface VaultMetrics {
  tvl: {
    value: string;
    timestamp: string;
    blockTimestamp: string;
    totalSupply: string;
    loading: boolean;
    error: string | null;
  };
  netApr: {
    value: number | null;
    timestamp: string | null;
    loading: boolean;
    error: string | null;
  };
  thirtyDayApr: {
    value: number | null;
    timestamp: string | null;
    loading: boolean;
    error: string | null;
  };
  sevenDayApr: {
    value: number | null;
    timestamp: string | null;
    loading: boolean;
    error: string | null;
  };
  composition: {
    value: any | null;
    loading: boolean;
    error: string | null;
  };
}

interface VaultStore {
  [vaultId: string]: VaultMetrics;
}

function createVaultStore() {
  const { subscribe, set, update } = writable<VaultStore>({});

  return {
    subscribe,
    set,
    update,
    
    // TVL methods
    setTvl: (vaultId: string, data: { tvl: string; timestamp: string; blockTimestamp: string; totalSupply: string }) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          tvl: {
            value: data.tvl,
            timestamp: data.timestamp,
            blockTimestamp: data.blockTimestamp,
            totalSupply: data.totalSupply,
            loading: false,
            error: null
          }
        }
      }));
    },
    
    // APR methods
    setNetApr: (vaultId: string, data: { apr: number; timestamp: string }) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          netApr: {
            value: data.apr,
            timestamp: data.timestamp,
            loading: false,
            error: null
          }
        }
      }));
    },
    
    setThirtyDayApr: (vaultId: string, data: { apr: number; timestamp: string }) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          thirtyDayApr: {
            value: data.apr,
            timestamp: data.timestamp,
            loading: false,
            error: null
          }
        }
      }));
    },
    
    setSevenDayApr: (vaultId: string, data: { apr: number; timestamp: string }) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          sevenDayApr: {
            value: data.apr,
            timestamp: data.timestamp,
            loading: false,
            error: null
          }
        }
      }));
    },
    
    // Composition methods
    setComposition: (vaultId: string, composition: any) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          composition: {
            value: composition,
            loading: false,
            error: null
          }
        }
      }));
    },
    
    // Loading states
    setLoading: (vaultId: string, metric: keyof VaultMetrics, loading: boolean) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          [metric]: {
            ...store[vaultId]?.[metric],
            loading
          }
        }
      }));
    },
    
    // Error handling
    setError: (vaultId: string, metric: keyof VaultMetrics, error: string | null) => {
      update(store => ({
        ...store,
        [vaultId]: {
          ...store[vaultId],
          [metric]: {
            ...store[vaultId]?.[metric],
            error,
            loading: false
          }
        }
      }));
    },
    
    // Fetch methods
    fetchAllMetrics: async (vaultId: string) => {
      if (!browser) return;
      
      // Initialize vault data if it doesn't exist
      update(store => ({
        ...store,
        [vaultId]: {
          tvl: { value: '0', timestamp: '', blockTimestamp: '', totalSupply: '0', loading: true, error: null },
          netApr: { value: null, timestamp: null, loading: true, error: null },
          thirtyDayApr: { value: null, timestamp: null, loading: true, error: null },
          sevenDayApr: { value: null, timestamp: null, loading: true, error: null },
          composition: { value: null, loading: true, error: null }
        }
      }));
      
      try {
        // Fetch all metrics in parallel
        const [tvlResponse, netAprResponse, thirtyDayAprResponse, sevenDayAprResponse, compositionResponse] = await Promise.all([
          fetch(`/api/vaults/${vaultId}/metrics/tvl?latest=true`),
          fetch(`/api/vaults/${vaultId}/metrics/net_apr`),
          fetch(`/api/vaults/${vaultId}/metrics/30d_apr`),
          fetch(`/api/vaults/${vaultId}/metrics/7d_apr`),
          fetch(`/api/vaults/${vaultId}/composition`)
        ]);
        
        // Process TVL data
        if (tvlResponse.ok) {
          const tvlData = await tvlResponse.json();
          if (tvlData.latestTvl) {
            update(store => ({
              ...store,
              [vaultId]: {
                ...store[vaultId],
                tvl: {
                  value: tvlData.latestTvl.totalAssets || '0',
                  timestamp: tvlData.latestTvl.timestamp || new Date().toISOString(),
                  blockTimestamp: Math.floor(new Date(tvlData.latestTvl.timestamp).getTime() / 1000).toString(),
                  totalSupply: '0',
                  loading: false,
                  error: null
                }
              }
            }));
          }
        }
        
        // Process Net APR data
        if (netAprResponse.ok) {
          const netAprData = await netAprResponse.json();
          update(store => ({
            ...store,
            [vaultId]: {
              ...store[vaultId],
              netApr: {
                value: netAprData.apr,
                timestamp: new Date().toISOString(),
                loading: false,
                error: null
              }
            }
          }));
        }
        
        // Process 30D APR data
        if (thirtyDayAprResponse.ok) {
          const thirtyDayAprData = await thirtyDayAprResponse.json();
          update(store => ({
            ...store,
            [vaultId]: {
              ...store[vaultId],
              thirtyDayApr: {
                value: thirtyDayAprData.apr,
                timestamp: new Date().toISOString(),
                loading: false,
                error: null
              }
            }
          }));
        }
        
        // Process 7D APR data
        if (sevenDayAprResponse.ok) {
          const sevenDayAprData = await sevenDayAprResponse.json();
          update(store => ({
            ...store,
            [vaultId]: {
              ...store[vaultId],
              sevenDayApr: {
                value: sevenDayAprData.apr,
                timestamp: new Date().toISOString(),
                loading: false,
                error: null
              }
            }
          }));
        }
        
        // Process composition data
        if (compositionResponse.ok) {
          const compositionData = await compositionResponse.json();
          update(store => ({
            ...store,
            [vaultId]: {
              ...store[vaultId],
              composition: {
                value: compositionData,
                loading: false,
                error: null
              }
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching vault metrics:', error);
        // Set error state for all metrics
        update(store => ({
          ...store,
          [vaultId]: {
            ...store[vaultId],
            tvl: { ...store[vaultId].tvl, loading: false, error: 'Failed to fetch TVL' },
            netApr: { ...store[vaultId].netApr, loading: false, error: 'Failed to fetch Net APR' },
            thirtyDayApr: { ...store[vaultId].thirtyDayApr, loading: false, error: 'Failed to fetch 30D APR' },
            sevenDayApr: { ...store[vaultId].sevenDayApr, loading: false, error: 'Failed to fetch 7D APR' },
            composition: { ...store[vaultId].composition, loading: false, error: 'Failed to fetch composition' }
          }
        }));
      }
    },
    
    // Reset store
    reset: () => set({})
  };
}

export const vaultStore = createVaultStore(); 