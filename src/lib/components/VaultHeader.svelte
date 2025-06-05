<script lang="ts">
  import NumberRoll from './NumberRoll.svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { prices } from '../stores/prices';
  import { vaultStore } from '../stores/vaultStore';
  import { loadingState } from '../stores/loading_state';

  export let vault: any;
  export let network: any;

  let isLoading = true;
  let mounted = false;

  // Générer le lien explorer
  $: explorerUrl = vault && network && vault.vaultContract
    ? (network.name === 'Base'
        ? `https://basescan.org/address/${vault.vaultContract}`
        : `https://etherscan.io/address/${vault.vaultContract}`)
    : null;

  async function loadData() {
    if (!browser || !mounted || !vault?.id) {
      console.log('Skipping loadData:', { browser, mounted, vaultId: vault?.id });
      return;
    }
    
    console.log('Loading data for vault:', vault.id);
    
    try {
      loadingState.setLoading(true);
      loadingState.setExpectedDataCount(1); // Une seule requête pour toutes les métriques

      await vaultStore.fetchAllMetrics(vault.id);
      
      loadingState.setLoading(false);
      loadingState.setLastUpdated(Date.now());
      isLoading = false;
    } catch (error) {
      console.error('Error loading vault data:', error);
      loadingState.setError(error instanceof Error ? error.message : String(error));
    }
  }

  onMount(() => {
    console.log('Component mounted, vault:', vault);
    mounted = true;
    if (vault?.id) {
      loadData();
    }
  });

  // Recharger les données quand le vault change, mais seulement côté client
  $: if (browser && mounted && vault?.id) {
    console.log('Vault changed, reloading data');
    loadData();
  }

  // Computed values from vaultStore
  $: netAprValue = $vaultStore[vault?.id]?.netApr?.value ?? undefined;
  $: apr30d = $vaultStore[vault?.id]?.thirtyDayApr?.value ?? undefined;
  $: totalAssets = $vaultStore[vault?.id]?.tvl?.value ?? '0';
</script>

<div class="vault-header-container">
  <div class="vault-title-row">
    <div class="vault-title-text-block">
      <div class="vault-title-container">
        <div class="vault-title">
          {vault.name}
          {#if explorerUrl}
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" class="explorer-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          {/if}
        </div>
      </div>
      <div class="vault-caption-row">
        {#if vault.curatorIcon}
          <img src={vault.curatorIcon} alt={vault.curator} class="curator-icon-small" />
        {/if}
        <span class="by-label">by</span>
        {#if vault.curatorWebsite}
          <a href={vault.curatorWebsite} target="_blank" rel="noopener" class="curator-link">{vault.curator}</a>
        {:else}
          <span class="curator-link">{vault.curator}</span>
        {/if}
      </div>
    </div>
    {#if vault.safeContract}
      <a href={`https://debank.com/profile/${vault.safeContract}`} target="_blank" rel="noopener noreferrer" class="debank-button">
        <span>View on DeBank</span>
        <img src="/debank.webp" alt="DeBank Profile" class="debank-icon" />
      </a>
    {/if}
  </div>
  {#if vault.description}
    <div class="vault-description">{vault.description}</div>
  {/if}
  <div class="vault-metrics-row">
    <div class="metric">
      <div class="metric-label">Net APR</div>
      <div class="metric-value apr-gradient {isLoading ? 'balance-blur' : ''}">
        {#if isLoading}
          <NumberRoll value={0} suffix="%" format={n => n.toFixed(2)} />
        {:else if netAprValue !== undefined}
          <NumberRoll value={netAprValue} suffix="%" format={n => n.toFixed(2)} />
        {:else}
          <span class="metric-placeholder">-</span>
        {/if}
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">30D APR</div>
      <div class="metric-value apr-gradient {isLoading ? 'balance-blur' : ''}">
        {#if isLoading}
          <NumberRoll value={0} suffix="%" format={n => n.toFixed(2)} />
        {:else if apr30d !== undefined}
          <NumberRoll value={apr30d} suffix="%" format={n => n.toFixed(2)} />
        {:else}
          <span class="metric-placeholder">-</span>
        {/if}
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">TVL</div>
      <div class="metric-value {isLoading ? 'balance-blur' : ''}">
        {#if isLoading}
          <NumberRoll value={0} suffix={` ${vault.underlyingToken}`} format={n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
        {:else}
          <div class="tvl-tooltip">
            <NumberRoll 
              value={parseFloat(totalAssets)}
              suffix={` ${vault.underlyingToken}`}
              format={n => {
                if (n >= 1000) {
                  return `${(n / 1000).toLocaleString(undefined, { 
                    minimumFractionDigits: vault.underlyingToken === 'WETH' ? 3 : 1, 
                    maximumFractionDigits: vault.underlyingToken === 'WETH' ? 3 : 1 
                  })}K`;
                }
                return n.toLocaleString(undefined, { 
                  minimumFractionDigits: vault.underlyingToken === 'WETH' ? 3 : 2, 
                  maximumFractionDigits: vault.underlyingToken === 'WETH' ? 3 : 2 
                });
              }}
            />
          </div>
        {/if}
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">Asset</div>
      <div class="metric-value">
        <div class="asset-inline">
          <img src={vault.underlyingTokenIcon} alt={vault.underlyingToken} class="asset-icon" />
          <span>{vault.underlyingToken}</span>
        </div>
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">Network</div>
      <div class="metric-value">
        <div class="asset-inline">
          <img src={vault.networkIcon} alt={vault.network} class="asset-icon" />
          <span>{vault.network}</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
.vault-header-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
}
.vault-title-row {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
}
.vault-title-text-block {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  height: 100%;
  gap: 0.75rem;
}
.vault-title-container {
  display: flex;
  align-items: center;
}
.vault-title {
  font-size: 3rem;
  font-weight: 600;
  color: #fff;
  margin: 0;
  line-height: 1.2;
  text-align: left;
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.curator-icon {
  display: none;
}
.curator-icon-small {
  width: 1.25em;
  height: 1.25em;
  border-radius: 0.25em;
  background: #fff;
  object-fit: contain;
  vertical-align: middle;
  margin-right: 0.2em;
}
.vault-caption-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  padding: 0;
}
.curator-link {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
  text-decoration: none;
  transition: color 0.15s;
}
.curator-link:hover {
  color: #fff;
}
.by-label {
  color: rgba(255, 255, 255, 0.5);
}
.network-icon {
  width: 1em;
  height: 1em;
  border-radius: 0.25em;
  object-fit: contain;
  background: none;
}
.network-name {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}
.explorer-link {
  display: inline-flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.7);
  transition: color 0.15s;
}
.explorer-link:hover {
  color: #fff;
}
.explorer-link svg {
  width: 1.25rem;
  height: 1.25rem;
}
.debank-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.15s;
  height: fit-content;
  white-space: nowrap;
  margin-left: auto;
  margin-top: 0.5rem;
}
.debank-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.debank-icon {
  width: 1.25rem;
  height: 1.25rem;
  object-fit: contain;
  filter: brightness(0) invert(1) sepia(0%) saturate(1000%) hue-rotate(180deg);
  transition: all 0.15s;
}
.debank-button:hover .debank-icon {
  filter: brightness(0) invert(1) sepia(0%) saturate(2000%) hue-rotate(180deg);
}
.vault-description {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
  max-width: 900px;
  margin: 0;
  text-align: left;
  line-height: 1.5;
}
.vault-metrics-row {
  display: flex;
  flex-direction: row;
  gap: 2rem;
  width: 100%;
  justify-content: space-between;
}
.metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  gap: 0.75rem;
}
.metric-label {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}
.metric-value {
  font-size: 1.25rem;
  font-weight: 500;
  color: #fff;
  letter-spacing: 0.02em;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  margin: 0;
}
.metric-placeholder {
  color: rgba(255, 255, 255, 0.3);
}
.asset-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
}
.asset-icon {
  width: 1.75rem;
  height: 1.75rem;
  display: inline-block;
  vertical-align: middle;
  object-fit: contain;
}
.apr-gradient {
  background: linear-gradient(3deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 600;
  color: transparent;
}
.tvl-usd {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.5);
  font-weight: normal;
}
@media (max-width: 900px) {
  .vault-header-container {
    padding: 0;
  }
  .vault-title {
    font-size: 2rem;
  }
  .vault-metrics-row {
    flex-wrap: wrap;
    gap: 1.5rem;
  }
  .metric {
    flex: 0 0 calc(50% - 0.75rem);
  }
}

@media (max-width: 640px) {
  .vault-header-container {
    gap: 1rem;
    align-items: center;
  }

  .vault-title-row {
    flex-direction: column;
    gap: 1rem;
    align-items: center;
    text-align: center;
  }

  .vault-title-text-block {
    align-items: center;
  }

  .vault-title {
    font-size: 1.75rem;
    text-align: center;
  }

  .vault-caption-row {
    font-size: 1rem;
    justify-content: center;
  }

  .debank-button {
    width: 100%;
    justify-content: center;
    margin-top: 0;
  }

  .vault-description {
    font-size: 0.9rem;
    text-align: center;
  }

  .vault-metrics-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    width: 100%;
  }

  .metric {
    flex: 0 0 auto;
    width: 100%;
    align-items: center;
  }

  /* Make the last metric (Network) span full width */
  .metric:last-child {
    grid-column: 1 / -1;
  }

  .metric-label {
    font-size: 0.8rem;
    text-align: center;
  }

  .metric-value {
    font-size: 1.1rem;
    align-items: center;
  }

  .asset-icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  .asset-inline {
    justify-content: center;
  }
}
.error-message {
  color: #ff4d4d;
  font-size: 0.9rem;
}
.loading-spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.tvl-tooltip {
  position: relative;
  display: inline-block;
}
.tooltip {
  visibility: hidden;
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(5px);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
  backdrop-filter: blur(10px);
  color: #fff;
  text-align: center;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  white-space: nowrap;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}
.tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -6px;
  border-width: 6px;
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.1) transparent transparent transparent;
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.1));
}
.tvl-tooltip:hover .tooltip {
  visibility: visible;
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style> 