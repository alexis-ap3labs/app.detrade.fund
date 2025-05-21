import { writable } from 'svelte/store';

export type TvlData = {
  tvl: string;
  lastUpdated: number;
};

export type TvlHistoryData = {
  timestamp: string;
  totalAssets: string;
};

export type TvlState = {
  [key: string]: TvlData;
};

// Durée de validité du cache en millisecondes (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

interface TVLStore {
  value: string;
  isLoading: boolean;
  lastUpdated: number | null;
}

function createTVLStore() {
  const { subscribe, set, update } = writable<TVLStore>({
    value: "0",
    isLoading: true,
    lastUpdated: null
  });

  return {
    subscribe,
    setValue: (value: string) => update(store => ({ ...store, value })),
    setLoading: (isLoading: boolean) => update(store => ({ ...store, isLoading })),
    setLastUpdated: (timestamp: number) => update(store => ({ ...store, lastUpdated: timestamp })),
    reset: () => set({ value: "0", isLoading: true, lastUpdated: null })
  };
}

export const tvlStore = createTVLStore();

function createTvlStore() {
  const { subscribe, set, update } = writable<TvlState>({});

  return {
    subscribe,
    set,
    getTvl: (vaultId: string): TvlData | undefined => {
      let result: TvlData | undefined;
      update(state => {
        result = state[vaultId];
        return state;
      });
      return result;
    },
    getTvlHistory: async (vaultId: string, timeFilter: 'all' | '3m' | '1m' | '1w' = '3m'): Promise<TvlHistoryData[]> => {
      console.log('Fetching TVL history for vault:', vaultId, 'with time filter:', timeFilter);
      try {
        const url = `/api/vaults/${vaultId}/metrics/tvl?time=${timeFilter}`;
        console.log('Making request to:', url);
        
        const response = await fetch(url);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          console.error(`Error fetching TVL history for ${vaultId}:`, response.status, response.statusText);
          return [];
        }
        
        const data = await response.json();
        console.log('Raw TVL history data received:', data);
        
        if (!data.tvl || !Array.isArray(data.tvl)) {
          console.warn(`Invalid TVL history data format for ${vaultId}:`, data);
          return [];
        }

        console.log(`Successfully processed ${data.tvl.length} TVL history events`);
        return data.tvl;
      } catch (error) {
        console.error(`Error fetching TVL history for ${vaultId}:`, error);
        return [];
      }
    },
    refreshTvl: async (vaultId: string): Promise<void> => {
      console.log('Refreshing TVL for vault:', vaultId);
      try {
        const response = await fetch(`/api/vaults/${vaultId}/metrics/tvl?latest=true`);
        if (!response.ok) {
          console.error(`Error fetching TVL for ${vaultId}:`, response.status);
          return;
        }
        const data = await response.json();
        console.log('TVL data received for', vaultId, ':', data);
        
        if (!data.latestTvl) {
          console.warn(`No TVL data received for ${vaultId}`);
          return;
        }

        update(state => ({
          ...state,
          [vaultId]: {
            tvl: data.latestTvl.totalAssets,
            lastUpdated: Date.now()
          }
        }));
      } catch (error) {
        console.error(`Error refreshing TVL for ${vaultId}:`, error);
      }
    },
    refreshAllTvls: async (vaultIds: string[]): Promise<void> => {
      console.log('Starting refresh for vaults:', vaultIds);
      
      try {
        // Récupérer toutes les données en parallèle
        const results = await Promise.all(
          vaultIds.map(async (vaultId) => {
            try {
              const response = await fetch(`/api/vaults/${vaultId}/metrics/tvl?latest=true`);
              if (!response.ok) {
                console.error(`Error fetching TVL for ${vaultId}:`, response.status);
                return { vaultId, success: false };
              }
              const data = await response.json();
              console.log('TVL data received for', vaultId, ':', data);
              
              if (!data.latestTvl) {
                console.warn(`No TVL data received for ${vaultId}, keeping existing values`);
                return { vaultId, success: false };
              }

              return {
                vaultId,
                success: true,
                data: {
                  tvl: data.latestTvl.totalAssets,
                  lastUpdated: Date.now()
                } as TvlData
              };
            } catch (error) {
              console.error(`Error fetching TVL for ${vaultId}:`, error);
              return { vaultId, success: false };
            }
          })
        );

        // Mettre à jour le store une seule fois avec toutes les nouvelles données
        update(state => {
          const newState = { ...state }; // Préserver les données existantes
          
          results.forEach(result => {
            if (result.success && result.data) {
              newState[result.vaultId] = result.data;
            }
          });

          return newState;
        });

        // Log des résultats
        const successCount = results.filter(r => r.success).length;
        console.log(`TVL refresh completed: ${successCount}/${vaultIds.length} vaults updated successfully`);
      } catch (error) {
        console.error('Error during TVL refresh:', error);
      }
    },
    refreshLatestTvl: async (vaultId: string): Promise<void> => {
      console.log(`Starting TVL refresh for vault: ${vaultId}`);
      const startTime = Date.now();
      
      try {
        const response = await fetch(`/api/vaults/${vaultId}/metrics/tvl?latest=true`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const endTime = Date.now();
        console.log(`TVL data received for ${vaultId} in ${endTime - startTime}ms:`, data);
        
        if (!data.latestTvl) {
          console.warn(`No TVL data received for ${vaultId}`);
          return;
        }

        update(state => ({
          ...state,
          [vaultId]: {
            tvl: data.latestTvl.totalAssets,
            lastUpdated: Date.now(),
            timestamp: new Date().toISOString()
          }
        }));
        
        console.log(`Successfully updated TVL store for ${vaultId}`);
      } catch (error) {
        console.error(`Error refreshing TVL for ${vaultId}:`, error);
        throw error; // Propager l'erreur pour la gestion dans le composant
      }
    }
  };
}

export const tvl = createTvlStore(); 