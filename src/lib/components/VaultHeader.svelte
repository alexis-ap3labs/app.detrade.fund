<script lang="ts">
  import NumberRoll from './NumberRoll.svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { prices } from '../stores/prices';
  import { thirtyDayApr } from '../stores/30d_apr';
  import { netApr } from '../stores/net_apr';
  import { latestTvl } from '../stores/latest_tvl';

  export let vault: any;
  export let network: any;
  export let tvlUsd: number | undefined = 0;
  export let netAprValue: number | undefined = 0;
  export let apr30d: number | undefined = 0;

  let tvlInAssets = '0';
  let isLoading = {
    tvl: true,
    netApr: true,
    apr30d: true
  };
  let errors: {
    tvl: Error | null;
    netApr: Error | null;
    apr30d: Error | null;
  } = {
    tvl: null,
    netApr: null,
    apr30d: null
  };
  let retryCount = 0;
  const MAX_RETRIES = 3;
  let mounted = false;

  $: formattedTvlUsd = tvlUsd ? new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(tvlUsd) : '$0';

  $: formattedNetApr = netAprValue ? `${netAprValue.toFixed(2)}%` : '0%';
  $: formattedApr30d = apr30d ? `${apr30d.toFixed(2)}%` : '0%';

  // Calculer la valeur USD en multipliant par le prix de l'underlying token
  $: tvlUsd = parseFloat(tvlInAssets) * ($prices[vault.underlyingToken]?.price || 0);

  // Générer le lien explorer
  $: explorerUrl = vault && network && vault.vaultContract
    ? (network.name === 'Base'
        ? `https://basescan.org/address/${vault.vaultContract}`
        : `https://etherscan.io/address/${vault.vaultContract}`)
    : null;

  async function loadData() {
    if (!browser || !mounted || !vault?.id) return;
    
    try {
      isLoading = { tvl: true, netApr: true, apr30d: true };
      errors = { tvl: null, netApr: null, apr30d: null };

      // Initialize all stores
      netApr.setLoading(vault.id, true);
      thirtyDayApr.setLoading(vault.id, true);

      // Load all metrics in parallel
      const [tvlResult, netAprResult, apr30dResult] = await Promise.allSettled([
        // Load TVL
        (async () => {
          try {
            await latestTvl.refreshLatestTvl(vault.id);
            const latestTvlData = latestTvl.getLatestTvl(vault.id);
            if (latestTvlData) {
              tvlInAssets = latestTvlData.tvl;
            }
            return true;
          } catch (error) {
            errors.tvl = error instanceof Error ? error : new Error(String(error));
            return false;
          }
        })(),

        // Load Net APR
        (async () => {
          try {
            const response = await fetch(`/api/vaults/${vault.id}/metrics/net_apr`);
            const data = await response.json();
            if (data.apr !== undefined) {
              netApr.setApr(vault.id, {
                apr: data.apr,
                startDate: data.startDate,
                endDate: data.endDate,
                totalReturn: data.totalReturn,
                timestamp: new Date().toISOString()
              });
            }
            return true;
          } catch (error) {
            netApr.setError(vault.id, error instanceof Error ? error.message : String(error));
            return false;
          }
        })(),

        // Load 30D APR
        (async () => {
          try {
            const response = await fetch(`/api/vaults/${vault.id}/metrics/30d_apr`);
            const data = await response.json();
            if (data.apr !== undefined) {
              thirtyDayApr.setApr(vault.id, {
                apr: data.apr,
                timestamp: new Date().toISOString()
              });
            }
            return true;
          } catch (error) {
            errors.apr30d = error instanceof Error ? error : new Error(String(error));
            return false;
          }
        })()
      ]);

      // Update loading states all at once
      isLoading = {
        tvl: tvlResult.status === 'rejected',
        netApr: netAprResult.status === 'rejected',
        apr30d: apr30dResult.status === 'rejected'
      };

      retryCount = 0;
    } catch (error) {
      console.error('Error loading vault data:', error);
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        setTimeout(loadData, 1000 * retryCount); // Exponential backoff
      }
    }
  }

  onMount(() => {
    mounted = true;
    if (vault?.id) {
      netApr.setLoading(vault.id, true);
      netApr.setError(vault.id, null);
    }
    loadData();
  });

  // Mettre à jour tvlInAssets quand le store change, mais seulement côté client
  $: if (browser && mounted && vault?.id) {
    const latestTvlData = latestTvl.getLatestTvl(vault.id);
    if (latestTvlData) {
      tvlInAssets = latestTvlData.tvl;
      isLoading.tvl = false;
    }
  }

  // Recharger les données quand le vault change, mais seulement côté client
  $: if (browser && mounted && vault?.id) {
    netApr.setLoading(vault.id, true);
    netApr.setError(vault.id, null);
    loadData();
  }

  // Subscribe to netApr store changes
  $: if (browser && mounted && vault?.id) {
    const netAprState = $netApr[vault.id];
    if (netAprState) {
      isLoading.netApr = netAprState.loading;
      if (netAprState.error) {
        errors.netApr = new Error(netAprState.error);
      }
      if (netAprState.data) {
        netAprValue = netAprState.data.apr ?? undefined;
      }
    }
  }
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
      <div class="metric-value apr-gradient {isLoading.netApr ? 'balance-blur' : ''}">
        {#if isLoading.netApr}
          <NumberRoll value={0} suffix="%" format={n => n.toFixed(2)} />
        {:else if errors.netApr}
          <span class="error-message">Error loading</span>
        {:else if netAprValue !== undefined}
          <NumberRoll value={netAprValue} suffix="%" format={n => n.toFixed(2)} />
        {:else}
          <span class="metric-placeholder">-</span>
        {/if}
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">30D APR</div>
      <div class="metric-value apr-gradient {isLoading.apr30d ? 'balance-blur' : ''}">
        {#if isLoading.apr30d}
          <NumberRoll value={0} suffix="%" format={n => n.toFixed(2)} />
        {:else if errors.apr30d}
          <span class="error-message">Error loading</span>
        {:else if apr30d !== undefined}
          <NumberRoll value={apr30d} suffix="%" format={n => n.toFixed(2)} />
        {:else}
          <span class="metric-placeholder">-</span>
        {/if}
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">TVL</div>
      <div class="metric-value {isLoading.tvl ? 'balance-blur' : ''}">
        {#if isLoading.tvl}
          <NumberRoll value={0} suffix={` ${vault.underlyingToken}`} format={n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
        {:else if errors.tvl}
          <span class="error-message">Error loading</span>
        {:else if parseFloat(tvlInAssets) >= 1000}
          <div class="tvl-tooltip">
            <NumberRoll 
              value={parseFloat(tvlInAssets) / 1000} 
              suffix={`K ${vault.underlyingToken}`}
              format={n => n.toLocaleString(undefined, { 
                minimumFractionDigits: vault.underlyingToken === 'WETH' ? 3 : 1, 
                maximumFractionDigits: vault.underlyingToken === 'WETH' ? 3 : 1 
              })}
            />
            <div class="tooltip">
              <NumberRoll 
                value={tvlUsd}
                prefix="$"
                format={n => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              />
            </div>
          </div>
        {:else}
          <div class="tvl-tooltip">
            <NumberRoll 
              value={parseFloat(tvlInAssets)}
              suffix={` ${vault.underlyingToken}`}
              format={n => n.toLocaleString(undefined, { 
                minimumFractionDigits: vault.underlyingToken === 'WETH' ? 3 : 2, 
                maximumFractionDigits: vault.underlyingToken === 'WETH' ? 3 : 2 
              })}
            />
            <div class="tooltip">
              <NumberRoll 
                value={tvlUsd}
                prefix="$"
                format={n => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              />
            </div>
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
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
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