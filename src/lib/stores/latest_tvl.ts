import { writable } from 'svelte/store';
import { ALL_VAULTS } from '../vaults';

export type LatestTvlData = {
  tvl: string;
  timestamp: string;
  blockTimestamp: string;
  totalSupply: string;
};

export type LatestTvlState = {
  [key: string]: LatestTvlData;
};

function createLatestTvlStore() {
  const { subscribe, set, update } = writable<LatestTvlState>({});

  const normalizeTvlData = (data: any, vaultId: string): LatestTvlData => {
    // Format de l'API TVL (nouvelle API)
    if (data.latestTvl) {
      return {
        tvl: data.latestTvl.totalAssets || '0',
        timestamp: data.latestTvl.timestamp || new Date().toISOString(),
        blockTimestamp: Math.floor(new Date(data.latestTvl.timestamp).getTime() / 1000).toString(),
        totalSupply: '0'
      };
    }

    // Format de l'API Subgraph (ancienne API)
    if (data.tvl !== undefined) {
      return {
        tvl: data.tvl || '0',
        timestamp: data.timestamp || new Date().toISOString(),
        blockTimestamp: data.blockTimestamp || Math.floor(Date.now() / 1000).toString(),
        totalSupply: data.totalSupply || '0'
      };
    }

    // Format par défaut si aucun format n'est reconnu
    console.warn(`Unknown data format for vault ${vaultId}:`, data);
    return {
      tvl: '0',
      timestamp: new Date().toISOString(),
      blockTimestamp: Math.floor(Date.now() / 1000).toString(),
      totalSupply: '0'
    };
  };

  return {
    subscribe,
    set,
    getLatestTvl: (vaultId: string): LatestTvlData | undefined => {
      let result: LatestTvlData | undefined;
      update(state => {
        result = state[vaultId];
        return state;
      });
      return result;
    },
    refreshLatestTvl: async (vaultId: string): Promise<void> => {
      // Vérifier si le vault est actif
      const vault = ALL_VAULTS.find(v => v.id === vaultId);
      if (!vault || !vault.isActive) {
        console.log(`Skipping TVL refresh for inactive vault: ${vaultId}`);
        return;
      }

      console.log('Refreshing latest TVL for vault:', vaultId);
      
      // Essayer d'abord la nouvelle API TVL
      try {
        const response = await fetch(`/api/vaults/${vaultId}/metrics/tvl?latest=true`);
        if (response.ok) {
          const data = await response.json();
          console.log('Latest TVL data received from new API for', vaultId, ':', data);
          
          if (data.latestTvl) {
            update(state => ({
              ...state,
              [vaultId]: normalizeTvlData(data, vaultId)
            }));
            return;
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch from new TVL API for ${vaultId}:`, error);
      }

      // Si la nouvelle API échoue, essayer l'ancienne API Subgraph
      try {
        const response = await fetch(`/api/subgraph/${vaultId}/latest-tvl`);
        if (response.ok) {
          const data = await response.json();
          console.log('Latest TVL data received from subgraph for', vaultId, ':', data);
          
          update(state => ({
            ...state,
            [vaultId]: normalizeTvlData(data, vaultId)
          }));
          return;
        }
      } catch (error) {
        console.warn(`Failed to fetch from subgraph API for ${vaultId}:`, error);
      }

      // Si les deux APIs échouent, mettre à jour avec des valeurs par défaut
      console.error(`All TVL fetch attempts failed for ${vaultId}`);
      update(state => ({
        ...state,
        [vaultId]: normalizeTvlData({}, vaultId)
      }));
    },
    refreshAllLatestTvls: async (vaultIds: string[]): Promise<void> => {
      console.log('Starting refresh for latest TVL of vaults:', vaultIds);
      
      // Filtrer les vaults actifs
      const activeVaultIds = vaultIds.filter(id => {
        const vault = ALL_VAULTS.find(v => v.id === id);
        return vault && vault.isActive;
      });

      if (activeVaultIds.length === 0) {
        console.log('No active vaults to refresh');
        return;
      }
      
      try {
        const results = await Promise.all(
          activeVaultIds.map(async (vaultId) => {
            try {
              // Essayer d'abord la nouvelle API TVL
              const tvlResponse = await fetch(`/api/vaults/${vaultId}/metrics/tvl?latest=true`);
              if (tvlResponse.ok) {
                const data = await tvlResponse.json();
                if (data.latestTvl) {
                  return {
                    vaultId,
                    success: true,
                    data: normalizeTvlData(data, vaultId)
                  };
                }
              }

              // Si la nouvelle API échoue, essayer l'ancienne API Subgraph
              const subgraphResponse = await fetch(`/api/subgraph/${vaultId}/latest-tvl`);
              if (subgraphResponse.ok) {
                const data = await subgraphResponse.json();
                return {
                  vaultId,
                  success: true,
                  data: normalizeTvlData(data, vaultId)
                };
              }

              // Si les deux APIs échouent, retourner des valeurs par défaut
              return {
                vaultId,
                success: true,
                data: normalizeTvlData({}, vaultId)
              };
            } catch (error) {
              console.error(`Error fetching latest TVL for ${vaultId}:`, error);
              return {
                vaultId,
                success: true,
                data: normalizeTvlData({}, vaultId)
              };
            }
          })
        );

        update(state => {
          const newState = { ...state };
          results.forEach(result => {
            if (result.success && result.data) {
              newState[result.vaultId] = result.data;
            }
          });
          return newState;
        });

        const successCount = results.filter(r => r.success).length;
        console.log(`Latest TVL refresh completed: ${successCount}/${vaultIds.length} vaults updated successfully`);
      } catch (error) {
        console.error('Error during latest TVL refresh:', error);
      }
    }
  };
}

export const latestTvl = createLatestTvlStore(); 