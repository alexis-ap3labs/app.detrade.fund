<script lang="ts">
  import { ALL_VAULTS } from '../vaults';
  import { address } from '../stores/wallet';
  import { latestTvl } from '../stores/latest_tvl';
  import { prices } from '../stores/prices';
  import { thirtyDayApr } from '../stores/30d_apr';
  import { netApr } from '../stores/net_apr';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import NumberRoll from '$lib/components/NumberRoll.svelte';

  $: isAdminWallet = $address?.toLowerCase() === '0x5904bfe5d9d96b57c98aaa935337e7aa228ed528'.toLowerCase();

  // Fonction pour vérifier si les données sont périmées (plus de 5 minutes)
  function isDataStale(lastUpdated: number): boolean {
    return Date.now() - lastUpdated > 5 * 60 * 1000; // 5 minutes
  }

  // Fonction pour récupérer le TVL de tous les vaults actifs
  async function fetchAllTvls() {
    const activeVaults = ALL_VAULTS.filter(vault => vault.isActive || isAdminWallet);
    const latestTvlData = $latestTvl;
    
    // Ne faire des appels API que pour les vaults qui n'ont pas de données ou dont les données sont périmées
    const vaultsToUpdate = activeVaults.filter(vault => {
      const data = latestTvlData[vault.id];
      return !data || isDataStale(new Date(data.timestamp).getTime());
    });

    if (vaultsToUpdate.length > 0) {
      console.log('Updating latest TVL data for active vaults:', vaultsToUpdate.map(v => v.id));
      await latestTvl.refreshAllLatestTvls(vaultsToUpdate.map(v => v.id));
    }
  }

  // Fonction pour récupérer les APR de tous les vaults actifs
  async function fetchAllAprs() {
    const activeVaults = ALL_VAULTS.filter(vault => vault.isActive || isAdminWallet);
    
    if (activeVaults.length > 0) {
      console.log('Updating APR data for active vaults:', activeVaults.map(v => v.id));
      try {
        // Fetch both 30 days and net APR data
        const thirtyDaysPromises = activeVaults.map(vault => {
          thirtyDayApr.setLoading(vault.id, true);
          return fetch(`/api/vaults/${vault.id}/metrics/30d_apr`)
            .then(response => response.json())
            .then(data => {
              if (data.apr !== undefined) {
                thirtyDayApr.setApr(vault.id, {
                  apr: data.apr,
                  timestamp: new Date().toISOString()
                });
              }
            })
            .catch(error => {
              console.error(`Error fetching 30D APR for ${vault.id}:`, error);
              thirtyDayApr.setError(vault.id, 'Failed to fetch APR data');
            });
        });
        const netAprPromises = activeVaults.map(vault => {
          netApr.setLoading(vault.id, true);
          return fetch(`/api/vaults/${vault.id}/metrics/net_apr`)
            .then(response => response.json())
            .then(data => {
              if (data.apr !== undefined) {
                netApr.setApr(vault.id, {
                  apr: data.apr,
                  startDate: data.startDate,
                  endDate: data.endDate,
                  totalReturn: data.totalReturn,
                  timestamp: new Date().toISOString()
                });
              }
            })
            .catch(error => {
              console.error(`Error fetching Net APR for ${vault.id}:`, error);
              netApr.setError(vault.id, 'Failed to fetch APR data');
            });
        });
        
        await Promise.all([...thirtyDaysPromises, ...netAprPromises]);
      } catch (error) {
        console.error('Error updating APR data:', error);
      }
    }
  }

  // Fonction pour charger les données initiales
  async function loadInitialData() {
    try {
      // Charger d'abord les données TVL
      await fetchAllTvls();
      
      // Puis charger les données APR
      await fetchAllAprs();
      
      // Initialiser le store des prix avec la liste des tokens à suivre
      const activeVaults = ALL_VAULTS.filter(vault => vault.isActive || isAdminWallet);
      const uniqueTokens = [...new Set(activeVaults.map(v => v.underlyingToken))];
      prices.initialize(uniqueTokens);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  $: {
    // Ne pas déclencher de mises à jour automatiques ici
    // console.log('Current prices store state:', $prices);
    // console.log('Current TVL store state:', $tvl);
  }

  $: tvlUsdValue = (vaultId: string, underlyingToken: string) => {
    const tvlData = $latestTvl[vaultId];
    const priceData = $prices[underlyingToken];
    
    if (!tvlData?.tvl || !priceData?.price) {
      return 0;
    }

    return parseFloat(tvlData.tvl) * priceData.price;
  };

  $: isLoadingPrice = (token: string) => {
    return !$prices[token]?.price;
  };

  let isLoading = true;
  let hasLoadedInitialData = false;

  onMount(() => {
    // Charger les données initiales de manière asynchrone
    if (!hasLoadedInitialData) {
      loadInitialData().then(() => {
        hasLoadedInitialData = true;
        isLoading = false;
      });
    }

    // Configurer les intervalles de rafraîchissement
    const tvlInterval = setInterval(fetchAllTvls, 5 * 60 * 1000); // 5 minutes
    const aprInterval = setInterval(fetchAllAprs, 5 * 60 * 1000); // 5 minutes

    return () => {
      clearInterval(tvlInterval);
      clearInterval(aprInterval);
    };
  });

  function handleVaultClick(vaultId: string) {
    goto(`/vault/${vaultId}`);
  }
</script>

<div class="vaults-list">
  {#each ALL_VAULTS
    .filter(vault => {
      // Si c'est le vault dev, on ne l'affiche que pour l'admin
      if (vault.id === "dev-detrade-core-usdc") {
        return isAdminWallet;
      }
      // Pour tous les autres vaults, on suit la logique isActive
      return vault.isActive;
    })
    .sort((a, b) => {
      const tvlA = $latestTvl[a.id]?.tvl ?? '0';
      const tvlB = $latestTvl[b.id]?.tvl ?? '0';
      return parseFloat(tvlB) - parseFloat(tvlA);
    }) as vault}
    <div class="vault-card" role="button" tabindex="0" on:click={() => handleVaultClick(vault.id)} on:keydown={(e) => e.key === 'Enter' && handleVaultClick(vault.id)}>
      <div class="vault-header">
        <div class="vault-logo-wrapper">
          <img src={vault.curatorIcon} alt="curator" class="vault-logo" />
          <img src={vault.networkIcon} alt="network" class="network-icon" />
        </div>
        <div>
          <div class="vault-name">{vault.name}</div>
          <div class="vault-curator">Curated by {vault.curator}</div>
        </div>
      </div>
      <div class="vault-details">
        <div class="vault-col center">
          <div class="mobile-label">Net APR</div>
          <div class="value">
            {#if $netApr[vault.id]?.data?.apr !== null && $netApr[vault.id]?.data?.apr !== undefined}
              {@const aprValue = $netApr[vault.id]?.data?.apr}
              {#if aprValue !== null && aprValue !== undefined}
                <span class="gradient-text">
                  <NumberRoll 
                    value={parseFloat(aprValue.toString())} 
                    format={(n) => n.toFixed(2)} 
                    suffix="%" 
                  />
                </span>
              {:else}
                <span class="gradient-text">
                  <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix="%" />
                </span>
              {/if}
            {:else}
              <span class="gradient-text">
                <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix="%" />
              </span>
            {/if}
          </div>
        </div>
        <div class="vault-col center">
          <div class="mobile-label">30D APR</div>
          <div class="value">
            {#if $thirtyDayApr[vault.id]?.data?.apr !== null && $thirtyDayApr[vault.id]?.data?.apr !== undefined}
              {@const aprValue = $thirtyDayApr[vault.id]?.data?.apr}
              {#if aprValue !== null && aprValue !== undefined}
                <span class="gradient-text">
                  <NumberRoll 
                    value={parseFloat(aprValue.toString())} 
                    format={(n) => n.toFixed(2)} 
                    suffix="%" 
                  />
                </span>
              {:else}
                <span class="gradient-text">
                  <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix="%" />
                </span>
              {/if}
            {:else}
              <span class="gradient-text">
                <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix="%" />
              </span>
            {/if}
          </div>
        </div>
        <div class="vault-col center">
          <div class="mobile-label">TVL</div>
          <div class="value">
            {#if $latestTvl[vault.id]?.tvl}
              {#if parseFloat($latestTvl[vault.id].tvl) >= 1000}
                <NumberRoll 
                  value={parseFloat($latestTvl[vault.id].tvl) / 1000} 
                  format={(n) => n.toFixed(1)} 
                  suffix={`K ${vault.underlyingToken}`} 
                />
              {:else}
                <NumberRoll 
                  value={parseFloat($latestTvl[vault.id].tvl)} 
                  format={(n) => n.toFixed(2)} 
                  suffix={` ${vault.underlyingToken}`} 
                />
              {/if}
            {:else}
              <div class="loading-blur">0.00 {vault.underlyingToken}</div>
            {/if}
            <div class="tvl-usd" class:loading={!$latestTvl[vault.id]?.tvl || isLoadingPrice(vault.underlyingToken)}>
              <NumberRoll 
                value={tvlUsdValue(vault.id, vault.underlyingToken)} 
                format={(n) => n.toLocaleString(undefined, {maximumFractionDigits: 0})} 
                prefix="$" 
              />
            </div>
          </div>
        </div>
        <div class="vault-col asset center">
          <div class="mobile-label">Asset</div>
          <div class="value">
            <span class="nowrap asset-inline">
              <img src={vault.underlyingTokenIcon} alt={vault.underlyingToken} class="asset-icon" />
              {vault.underlyingToken}
            </span>
          </div>
        </div>
        <div class="vault-col center">
          <div class="mobile-label">Rewards</div>
          <div class="value">
            {#if vault.farmedProtocolIcons.length > 0}
              {#each vault.farmedProtocolIcons as icon, i}
                <span class="reward-icon-bg">
                  <img src={icon} alt="Reward" class="reward-icon" />
                </span>
              {/each}
            {:else}
              <span>-</span>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
.vaults-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.vault-card {
  background: rgba(10, 34, 58, 0.503);
  border-radius: 0.75rem;
  padding: 1.5rem;
  color: #fff;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2.5rem;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
}

.vault-card:hover {
  background: rgba(10, 34, 58, 0.7);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1),
              0 0 20px rgba(255, 255, 255, 0.05);
}

.vault-card:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1),
              0 0 20px rgba(255, 255, 255, 0.05);
}

.vault-card:active {
  transform: translateY(0);
  transition: all 0.1s ease-in-out;
}

.vault-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 320px;
  flex: 0 0 auto;
}
.vault-logo-wrapper {
  position: relative;
  display: inline-block;
}
.vault-logo {
  width: 48px;
  height: 48px;
  border-radius: 0.75rem;
  background: #fff;
  display: block;
}
.network-icon {
  position: absolute;
  right: -4.5px;
  bottom: -4.5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  /* background: #fff; */
  /* border: 2px solid #0a223a; */
  /* box-shadow: 0 0 4px rgba(0,0,0,0.08); */
}
.vault-name {
  font-size: 1.25rem;
  font-weight: bold;
}
.vault-curator {
  font-size: 1rem;
  color: #7da2c1;
}
.vault-details {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 3rem;
  flex: 1 1 0;
}
.vault-details > div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.label {
  font-size: 0.9rem;
  color: #7da2c1;
}
.value {
  font-size: 1.25rem;
  font-weight: normal;
}
.asset {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.asset-icon {
  width: 24px;
  height: 24px;
}
.vaults-header-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  background: transparent;
  color: #7da2c1;
  font-size: 1rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  padding-left: 2rem;
  padding-right: 2rem;
  gap: 2.5rem;
}
.vault-header-col {
  min-width: 320px;
  flex: 0 0 auto;
}
.vault-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
}
.vault-col.center {
  justify-content: center;
  align-items: center;
  text-align: center;
}
.reward-icon-bg {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #fff;
  border-radius: 50%;
  margin: 0 2px;
}
.reward-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  background: transparent;
  border-radius: 0;
  display: block;
}
.nowrap {
  white-space: nowrap;
}
.asset-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  vertical-align: middle;
}
.asset-icon {
  width: 24px;
  height: 24px;
  display: inline-block;
  vertical-align: middle;
  /* background: #fff;  // optionnel, à activer si tu veux un fond blanc */
  /* border-radius: 50%; // optionnel, à activer si tu veux un logo rond */
}
.vault-details .vault-col,
.vault-details .vault-col span,
.vault-details .vault-col img {
  font-size: 1.25rem;
  font-weight: normal;
}
.loading-placeholder {
  color: #7da2c1;
  font-size: 0.875rem;
  animation: pulse 1.5s infinite;
  opacity: 0.7;
}
.loading-blur {
  filter: blur(4px);
  animation: pulse 1.5s infinite;
  opacity: 0.7;
}
.tvl-usd {
  font-size: 0.875rem;
  color: #7da2c1;
  margin-top: 0.25rem;
  transition: all 0.3s ease;
}
.tvl-usd.loading {
  filter: blur(4px);
  animation: pulse 1.5s infinite;
  opacity: 0.7;
}
@keyframes pulse {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
  }
}
.mobile-label {
  display: none;
  font-size: 0.875rem;
  color: #7da2c1;
  margin-bottom: 0.25rem;
}
@media (max-width: 1100px) {
  .vault-card {
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    text-align: center;
  }
  .vault-header {
    min-width: 100%;
    width: 100%;
    justify-content: center;
  }
  .vault-details {
    flex-direction: column;
    width: 100%;
    gap: 1.5rem;
    align-items: center;
  }
  .vault-col {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .vault-col.center {
    align-items: center;
  }
  .mobile-label {
    display: block;
    text-align: center;
  }
  .value {
    font-size: 1.25rem;
    font-weight: normal;
    text-align: center;
  }
  .tvl-usd {
    margin-top: 0.25rem;
    text-align: center;
  }
  .asset-inline {
    justify-content: center;
  }
}
.gradient-text {
  background: linear-gradient(135deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 20px rgba(77, 168, 255, 0.5);
  font-weight: 600;
}
.apr-details {
  font-size: 0.75rem;
  color: #7da2c1;
  margin-top: 0.25rem;
  text-align: center;
}
.apr-period {
  margin-bottom: 0.125rem;
}
.apr-total-return {
  font-weight: 500;
}
</style> 