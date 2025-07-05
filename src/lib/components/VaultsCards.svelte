<script lang="ts">
  import { ALL_VAULTS, ASSETS } from '../vaults';
  import { address } from '../stores/wallet';
  import { prices } from '../stores/prices';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import NumberRoll from '$lib/components/NumberRoll.svelte';
  import { loadingState } from '../stores/loading_state';
  import { vaultStore } from '../stores/vaultStore';
  import { NETWORKS } from '../vaults';
  import { fade } from 'svelte/transition';

  $: isAdminWallet = $address?.toLowerCase() === '0x5904bfe5d9d96b57c98aaa935337e7aa228ed528'.toLowerCase();

  // Suppression de la restriction EURC - maintenant visible de tous

  // Fonction pour vérifier si les données sont périmées (plus de 30 secondes)
  function isDataStale(lastUpdated: number): boolean {
    return Date.now() - lastUpdated > 30 * 1000; // 30 secondes
  }

  function getExplorerBaseUrl(): string {
    return 'https://basescan.org/tx/';
  }

  // Fonction pour charger les données initiales avec optimisation groupée
  async function loadInitialDataOptimized() {
    try {
      loadingState.setLoading(true);
      loadingState.setGlobalDataReady(false);
      
      const activeVaults = ALL_VAULTS.filter(vault => vault.isActive || isAdminWallet);
      const vaultIds = activeVaults.map(v => v.id);
      
      // Initialiser le store des prix
      const uniqueTokens = [...new Set(activeVaults.map(v => v.underlyingToken))];
      if (!uniqueTokens.includes('WETH')) {
        uniqueTokens.push('WETH');
      }
      prices.initialize(uniqueTokens);
      
      // Créer des requêtes groupées par type
      const tvlPromises = vaultIds.map(id => 
        fetch(`/api/vaults/${id}/metrics/tvl?latest=true`)
          .then(res => res.ok ? res.json() : null)
          .then(data => ({ id, data }))
          .catch(() => ({ id, data: null }))
      );
      
      const netAprPromises = vaultIds.map(id => 
        fetch(`/api/vaults/${id}/metrics/net_apr`)
          .then(res => res.ok ? res.json() : null)
          .then(data => ({ id, data }))
          .catch(() => ({ id, data: null }))
      );
      
      const thirtyDayAprPromises = vaultIds.map(id => 
        fetch(`/api/vaults/${id}/metrics/30d_apr`)
          .then(res => res.ok ? res.json() : null)
          .then(data => ({ id, data }))
          .catch(() => ({ id, data: null }))
      );
      
      const sevenDayAprPromises = vaultIds.map(id => 
        fetch(`/api/vaults/${id}/metrics/7d_apr`)
          .then(res => res.ok ? res.json() : null)
          .then(data => ({ id, data }))
          .catch(() => ({ id, data: null }))
      );
      
      const compositionPromises = vaultIds.map(id => 
        fetch(`/api/vaults/${id}/composition`)
          .then(res => res.ok ? res.json() : null)
          .then(data => ({ id, data }))
          .catch(() => ({ id, data: null }))
      );
      
      // Attendre que toutes les requêtes se terminent
      const [tvlResults, netAprResults, thirtyDayAprResults, sevenDayAprResults, compositionResults] = await Promise.all([
        Promise.all(tvlPromises),
        Promise.all(netAprPromises),
        Promise.all(thirtyDayAprPromises),
        Promise.all(sevenDayAprPromises),
        Promise.all(compositionPromises)
      ]);
      
      // Mettre à jour le store avec toutes les données en une seule fois
      vaultStore.update(store => {
        const newStore = { ...store };
        
        // Initialiser tous les vaults
        vaultIds.forEach(id => {
          newStore[id] = {
            tvl: { value: '0', timestamp: '', blockTimestamp: '', totalSupply: '0', loading: false, error: null },
            netApr: { value: null, timestamp: null, loading: false, error: null },
            thirtyDayApr: { value: null, timestamp: null, loading: false, error: null },
            sevenDayApr: { value: null, timestamp: null, loading: false, error: null },
            composition: { value: null, loading: false, error: null }
          };
        });
        
        // Appliquer les données TVL
        tvlResults.forEach(result => {
          if (result.data?.latestTvl) {
            newStore[result.id].tvl = {
              value: result.data.latestTvl.totalAssets || '0',
              timestamp: result.data.latestTvl.timestamp || new Date().toISOString(),
              blockTimestamp: Math.floor(new Date(result.data.latestTvl.timestamp).getTime() / 1000).toString(),
              totalSupply: '0',
              loading: false,
              error: null
            };
          }
        });
        
        // Appliquer les données Net APR
        netAprResults.forEach(result => {
          if (result.data?.apr !== undefined) {
            newStore[result.id].netApr = {
              value: result.data.apr,
              timestamp: new Date().toISOString(),
              loading: false,
              error: null
            };
          }
        });
        
        // Appliquer les données 30D APR
        thirtyDayAprResults.forEach(result => {
          if (result.data?.apr !== undefined) {
            newStore[result.id].thirtyDayApr = {
              value: result.data.apr,
              timestamp: new Date().toISOString(),
              loading: false,
              error: null
            };
          }
        });
        
        // Appliquer les données 7D APR
        sevenDayAprResults.forEach(result => {
          if (result.data?.apr !== undefined) {
            newStore[result.id].sevenDayApr = {
              value: result.data.apr,
              timestamp: new Date().toISOString(),
              loading: false,
              error: null
            };
          }
        });
        
        // Appliquer les données de composition
        compositionResults.forEach(result => {
          if (result.data) {
            newStore[result.id].composition = {
              value: result.data,
              loading: false,
              error: null
            };
          }
        });
        
        return newStore;
      });
      
      loadingState.setLoading(false);
      loadingState.setLastUpdated(Date.now());
      loadingState.setGlobalDataReady(true);
      
      hasLoadedInitialData = true;
      isLoading = false;
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      loadingState.setError(error instanceof Error ? error.message : String(error));
      loadingState.setGlobalDataReady(true); // Afficher quand même les vaults même en cas d'erreur
    }
  }

  $: tvlUsdValue = (vaultId: string, underlyingToken: string) => {
    const tvlData = $vaultStore[vaultId]?.tvl;
    const priceData = $prices[underlyingToken];
    
    if (!tvlData?.value || !priceData?.price) {
      return 0;
    }

    return parseFloat(tvlData.value) * priceData.price;
  };

  let isLoading = true;
  let hasLoadedInitialData = false;

  $: isLoadingPrice = (token: string) => {
    return !$prices[token]?.price;
  };

  onMount(() => {
    // Charger les données initiales de manière asynchrone
    if (!hasLoadedInitialData) {
      loadInitialDataOptimized();
    }

    // Configurer les intervalles de rafraîchissement
    const refreshInterval = setInterval(() => {
      const currentState = $loadingState;
      if (!currentState.isLoading) {
        loadInitialDataOptimized();
      }
    }, 30 * 1000); // 30 secondes

    return () => {
      clearInterval(refreshInterval);
    };
  });

  function handleVaultClick(vaultId: string) {
    goto(`/vault/${vaultId}`);
  }

  function cropHash(hash: string | undefined): string {
    if (!hash) return 'Unknown';
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  }

  function getActivityLinkFromId(id: string | undefined): string {
    if (!id) return '#';
    const hash = id.slice(0, 66);
    return getExplorerBaseUrl() + hash;
  }
</script>

<div class="vaults-list">
  {#if !$loadingState.isGlobalDataReady}
    <div class="global-loader">
      <div class="loader-content">
        <div class="loading-spinner"></div>
      </div>
    </div>
  {:else}
    {#each ALL_VAULTS
      .filter(vault => {
        // Si c'est le vault dev, on ne l'affiche que pour l'admin
        if (vault.id === "dev-detrade-core-usdc") {
          return isAdminWallet;
        }
        // Le vault EURC est maintenant visible de tous (comme les autres vaults actifs)
        // Pour tous les autres vaults, on suit la logique isActive
        return vault.isActive;
      })
      as vault, index}
      <div class="vault-card" 
           role="button" 
           tabindex="0" 
           on:click={() => handleVaultClick(vault.id)} 
           on:keydown={(e) => e.key === 'Enter' && handleVaultClick(vault.id)}
           in:fade={{ delay: 100 + (index * 150), duration: 600 }}>
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
              {#if $vaultStore[vault.id]?.netApr.value !== null && $vaultStore[vault.id]?.netApr.value !== undefined}
                {@const aprValue = $vaultStore[vault.id]?.netApr.value}
                {#if aprValue !== null && aprValue !== undefined}
                  <span class="gradient-text">
                    {#key aprValue}
                      <NumberRoll 
                        value={aprValue} 
                        format={(n) => n.toFixed(2)} 
                        suffix="%" 
                      />
                    {/key}
                  </span>
                {:else}
                  <span class="gradient-text">
                    {#key 0}
                      <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix="%" />
                    {/key}
                  </span>
                {/if}
              {:else}
                <span class="gradient-text">
                  {#key 0}
                    <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix="%" />
                  {/key}
                </span>
              {/if}
            </div>
          </div>
          <div class="vault-col center">
            <div class="mobile-label">30D APR</div>
            <div class="value">
              {#if $vaultStore[vault.id]?.thirtyDayApr.value !== null && $vaultStore[vault.id]?.thirtyDayApr.value !== undefined}
                {@const aprValue = $vaultStore[vault.id]?.thirtyDayApr.value}
                {#if aprValue !== null && aprValue !== undefined}
                  <span class="gradient-text">
                    {#key aprValue}
                      <NumberRoll 
                        value={aprValue} 
                        format={(n) => n.toFixed(2)} 
                        suffix="%" 
                      />
                    {/key}
                  </span>
                {:else}
                  <span class="gradient-text">
                    {#key 0}
                      <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix="%" />
                    {/key}
                  </span>
                {/if}
              {:else}
                <span class="gradient-text">
                  {#key 0}
                    <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix="%" />
                  {/key}
                </span>
              {/if}
            </div>
          </div>
          <div class="vault-col center">
            <div class="mobile-label">TVL</div>
            <div class="value">
              {#if $vaultStore[vault.id]?.tvl.value}
                {#if parseFloat($vaultStore[vault.id].tvl.value) >= 1000}
                  {#key $vaultStore[vault.id].tvl.value}
                    <NumberRoll 
                      value={parseFloat($vaultStore[vault.id].tvl.value) / 1000} 
                      format={(n) => n.toFixed(1)} 
                      suffix={`K ${vault.underlyingToken}`} 
                    />
                  {/key}
                {:else}
                  {#key $vaultStore[vault.id].tvl.value}
                    <NumberRoll 
                      value={parseFloat($vaultStore[vault.id].tvl.value)} 
                      format={(n) => n.toFixed(2)} 
                      suffix={` ${vault.underlyingToken}`} 
                    />
                  {/key}
                {/if}
              {:else}
                <span class="gradient-text">
                  {#key 0}
                    <NumberRoll value={0} format={(n) => n.toFixed(2)} suffix={` ${vault.underlyingToken}`} />
                  {/key}
                </span>
              {/if}
              <div class="tvl-usd" class:loading={!$vaultStore[vault.id]?.tvl.value || isLoadingPrice(vault.underlyingToken)}>
                {#if $vaultStore[vault.id]?.tvl.value && !isLoadingPrice(vault.underlyingToken)}
                  {#key tvlUsdValue(vault.id, vault.underlyingToken)}
                    <NumberRoll 
                      value={tvlUsdValue(vault.id, vault.underlyingToken)} 
                      format={(n) => n.toLocaleString(undefined, {maximumFractionDigits: 0})} 
                      prefix="$" 
                    />
                  {/key}
                {:else}
                  <span class="gradient-text">
                    {#key 0}
                      <NumberRoll value={0} format={(n) => n.toLocaleString(undefined, {maximumFractionDigits: 0})} prefix="$" />
                    {/key}
                  </span>
                {/if}
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
            <div class="value reward-icons-inline">
              {#if vault.farmedProtocolIcons.length > 0}
                {#each vault.farmedProtocolIcons as icon, i}
                  {#if icon === ASSETS.icons.tac}
                    <span class="reward-icon-bg reward-icon-tooltip-container">
                      <img src={icon} alt="TAC" class="reward-icon" />
                      <span class="reward-tooltip">This vault earns TAC points</span>
                    </span>
                  {:else if icon === ASSETS.icons.resolv}
                    <span class="reward-icon-bg reward-icon-tooltip-container">
                      <img src={icon} alt="Resolv" class="reward-icon" />
                      <span class="reward-tooltip">This vault earns Resolv points</span>
                    </span>
                  {:else}
                    <span class="reward-icon-bg">
                      <img src={icon} alt="Reward" class="reward-icon" />
                    </span>
                  {/if}
                {/each}
              {:else}
                <span>-</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/each}
  {/if}
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
.reward-icons-inline {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.25rem;
}
.reward-icon-tooltip-container {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.reward-tooltip {
  visibility: hidden;
  opacity: 0;
  position: absolute;
  bottom: 120%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 32, 48, 0.93);
  color: #b4c6ef;
  padding: 0.18em 0.55em;
  border-radius: 0.35em;
  font-size: 13px !important;
  font-weight: 400;
  white-space: nowrap;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(77,168,255,0.10);
  border: 1px solid rgba(77,168,255,0.10);
  transition: opacity 0.18s, visibility 0.18s;
  pointer-events: none;
}
.reward-icon-tooltip-container:hover .reward-tooltip,
.reward-icon-tooltip-container:focus-within .reward-tooltip {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}

/* Styles pour le loader global */
.global-loader {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
  width: 100%;
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top: 3px solid rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-text {
  color: #7da2c1;
  font-size: 1.1rem;
  text-align: center;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Animation d'apparition des vault cards */
@keyframes slideUpFade {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style> 