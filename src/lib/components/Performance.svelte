<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { ALL_VAULTS } from '$lib/vaults';
  import { thirtyDayApr } from '$lib/stores/30d_apr';
  import { netApr } from '$lib/stores/net_apr';
  import { sevenDayApr } from '$lib/stores/7d_apr';
  import NumberRoll from './NumberRoll.svelte';

  export let vaultId: string;

  let apr30d: string | null = null;
  let apr7d: string | null = null;
  let netAprValue: string | null = null;
  let performanceFee: string = ALL_VAULTS.find(vault => vault.id === vaultId)?.performanceFee || '10%';
  let feeReceiver: string = ALL_VAULTS.find(vault => vault.id === vaultId)?.feeReceiver || '0x1234...5678';

  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function getExplorerUrl(address: string): string {
    return `https://basescan.org/address/${address}`;
  }

  async function fetchAprData() {
    if (!browser || !mounted) return;
    
    try {
      // Fetch 30D APR
      const response30d = await fetch(`/api/vaults/${vaultId}/metrics/30d_apr`);
      const data30d = await response30d.json();
      apr30d = data30d.apr ? `${parseFloat(data30d.apr).toFixed(2)}%` : null;

      // Fetch 7D APR
      const response7d = await fetch(`/api/vaults/${vaultId}/metrics/7d_apr`);
      const data7d = await response7d.json();
      if (data7d.apr) {
        sevenDayApr.setApr(vaultId, data7d.apr, new Date().toISOString());
        apr7d = `${parseFloat(data7d.apr).toFixed(2)}%`;
      } else {
        sevenDayApr.setError(vaultId, 'No 7D APR data available');
        apr7d = null;
      }

      // Fetch Net APR
      const responseNet = await fetch(`/api/vaults/${vaultId}/metrics/net_apr`);
      const dataNet = await responseNet.json();
      netAprValue = dataNet.apr ? `${parseFloat(dataNet.apr).toFixed(2)}%` : null;
    } catch (error) {
      console.error('Error fetching APR data:', error);
      sevenDayApr.setError(vaultId, 'Failed to fetch 7D APR data');
    }
  }

  let mounted = false;

  onMount(() => {
    mounted = true;
    fetchAprData();
  });

  // Only update when vaultId changes, but only on the client side
  $: if (browser && mounted && vaultId) {
    fetchAprData();
  }
</script>

<div class="performance-outer">
  <div class="header">
    <div class="title-info">
      <h4 class="title-label">Performance</h4>
    </div>
  </div>
  <div class="apr-grid">
    <div class="perf-box">
      <div class="perf-label">
        7D APR
        <div class="info-tooltip">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="info-icon">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <div class="tooltip-content">
            <p>7D APR represents the annualized return of the vault over the last 7 days.</p>
            <p>It shows the vault's very recent performance, extrapolated to an annual rate.</p>
          </div>
        </div>
      </div>
      <div class="perf-value apr-gradient">
        {#if apr7d !== null}
          <NumberRoll value={parseFloat(apr7d)} suffix="%" format={n => n.toFixed(2)} />
        {:else}
          <span class="metric-placeholder">-</span>
        {/if}
      </div>
    </div>
    <div class="perf-box">
      <div class="perf-label">
        30D APR
        <div class="info-tooltip">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="info-icon">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <div class="tooltip-content">
            <p>30D APR represents the annualized return of the vault over the last 30 days.</p>
            <p>It shows the vault's recent performance, extrapolated to an annual rate.</p>
          </div>
        </div>
      </div>
      <div class="perf-value apr-gradient">
        {#if apr30d !== null}
          <NumberRoll value={parseFloat(apr30d)} suffix="%" format={n => n.toFixed(2)} />
        {:else}
          <span class="metric-placeholder">-</span>
        {/if}
      </div>
    </div>
    <div class="perf-box">
      <div class="perf-label">
        Net APR
        <div class="info-tooltip">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="info-icon">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <div class="tooltip-content">
            <p>Net APR represents the annualized return of the vault since its inception (Day 0) until today.</p>
            <p>It shows how much the vault has grown on an annual basis since it started operating.</p>
          </div>
        </div>
      </div>
      <div class="perf-value apr-gradient">
        {#if netAprValue !== null}
          <NumberRoll value={parseFloat(netAprValue)} suffix="%" format={n => n.toFixed(2)} />
        {:else}
          <span class="metric-placeholder">-</span>
        {/if}
      </div>
    </div>
  </div>
  <div class="fees-grid">
    <div class="perf-box">
      <div class="perf-label">Performance Fee</div>
      <div class="perf-value performance-fee">
        {performanceFee}
      </div>
    </div>
    <div class="perf-box">
      <div class="perf-label">Fee Receiver</div>
      <div class="perf-value fee-receiver">
        <a href={getExplorerUrl(feeReceiver)} target="_blank" rel="noopener noreferrer" class="fee-link">
          {formatAddress(feeReceiver)}
          <svg class="external-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  </div>
</div>

<style>
.performance-outer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.title-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.02em;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.apr-grid, .fees-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-gap: 1rem;
  width: 100%;
}

.fees-grid {
  grid-template-columns: repeat(2, 1fr);
}

.perf-box {
  background: rgba(10, 34, 58, 0.503);
  border-radius: 0.75rem;
  box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}

.perf-label {
  color: rgba(255,255,255,0.5);
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.perf-value {
  color: #fff;
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.fee-receiver, .performance-fee {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.8);
}

.fee-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: inherit;
  text-decoration: none;
  transition: opacity 0.2s ease;
}

.fee-link:hover {
  opacity: 0.8;
}

.external-link-icon {
  width: 1rem;
  height: 1rem;
  opacity: 0.7;
}

.metric-placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.apr-gradient {
  background: linear-gradient(3deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 600;
  color: transparent;
}

.info-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 0.5rem;
  cursor: help;
}

.info-icon {
  color: rgba(255, 255, 255, 0.5);
  transition: color 0.2s ease;
}

.info-tooltip:hover .info-icon {
  color: rgba(255, 255, 255, 0.8);
}

.tooltip-content {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1rem;
  width: 300px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.9rem;
  line-height: 1.5;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  pointer-events: none;
}

.tooltip-content p {
  margin: 0 0 0.5rem 0;
}

.tooltip-content p:last-child {
  margin-bottom: 0;
  font-family: monospace;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}

.info-tooltip:hover .tooltip-content {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.info-tooltip .tooltip-content::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 6px;
  border-style: solid;
  border-color: rgba(0, 0, 0, 0.9) transparent transparent transparent;
}

@media (max-width: 900px) {
  .apr-grid, .fees-grid {
    grid-template-columns: 1fr;
  }
  .perf-box {
    padding: 1.2rem 1rem;
  }
}
</style> 