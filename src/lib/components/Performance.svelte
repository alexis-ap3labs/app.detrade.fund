<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { ALL_VAULTS } from '$lib/vaults';
  import { thirtyDayApr } from '$lib/stores/30d_apr';
  import { netApr } from '$lib/stores/net_apr';
  import { sevenDayApr } from '$lib/stores/7d_apr';
  import NumberRoll from './NumberRoll.svelte';

  export let vaultId: string;

  // APR data state management
  let apr30d: string | null = null;
  let apr7d: string | null = null;
  let netAprValue: string | null = null;
  
  // Vault configuration data
  let performanceFee: string = ALL_VAULTS.find(vault => vault.id === vaultId)?.performanceFee || '10%';
  let feeReceiver: string = ALL_VAULTS.find(vault => vault.id === vaultId)?.feeReceiver || '0x1234...5678';

  // Cache system to reduce API calls (5 minute cache duration)
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  let cache = {
    data: null as any,
    timestamp: 0
  };

  // Format blockchain addresses for display (first 6 + last 4 characters)
  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Generate blockchain explorer URLs (BaseScan for Base network)
  function getExplorerUrl(address: string): string {
    return `https://basescan.org/address/${address}`;
  }

  // Fetch APR data from multiple endpoints with caching
  async function fetchAprData() {
    if (!browser || !mounted) return;
    
    // Check cache validity first
    const now = Date.now();
    if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
      apr30d = cache.data.apr30d;
      apr7d = cache.data.apr7d;
      netAprValue = cache.data.netAprValue;
      return;
    }

    try {
      // Fetch all APR metrics in parallel for better performance
      const [response30d, response7d, responseNet] = await Promise.all([
        fetch(`/api/vaults/${vaultId}/metrics/30d_apr`),
        fetch(`/api/vaults/${vaultId}/metrics/7d_apr`),
        fetch(`/api/vaults/${vaultId}/metrics/net_apr`)
      ]);

      const [data30d, data7d, dataNet] = await Promise.all([
        response30d.json(),
        response7d.json(),
        responseNet.json()
      ]);

      // Process 30D APR data
      apr30d = data30d.apr ? `${parseFloat(data30d.apr).toFixed(2)}%` : null;

      // Process 7D APR data and update store
      if (data7d.apr) {
        sevenDayApr.setApr(vaultId, data7d.apr, new Date().toISOString());
        apr7d = `${parseFloat(data7d.apr).toFixed(2)}%`;
      } else {
        sevenDayApr.setError(vaultId, 'No 7D APR data available');
        apr7d = null;
      }

      // Process Net APR data (since inception)
      netAprValue = dataNet.apr ? `${parseFloat(dataNet.apr).toFixed(2)}%` : null;

      // Update cache with fresh data
      cache = {
        data: { apr30d, apr7d, netAprValue },
        timestamp: now
      };
    } catch (error) {
      console.error('Error fetching APR data:', error);
      sevenDayApr.setError(vaultId, 'Failed to fetch APR data');
    }
  }

  let mounted = false;

  onMount(() => {
    mounted = true;
    fetchAprData();
  });

  // Re-fetch data when vaultId changes (client-side only)
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

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  width: 100%;
}

.title-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
}

.title-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.02em;
  text-align: left;
  width: 100%;
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
  color: transparent; /* Fallback for browsers that don't support background-clip */
}

/* Interactive tooltip component for APR explanations */
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

/* Tooltip content with backdrop blur and positioning */
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

/* Show tooltip on hover */
.info-tooltip:hover .tooltip-content {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

/* Tooltip arrow pointing downward */
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

/* Responsive design for mobile devices */
@media (max-width: 900px) {
  .apr-grid, .fees-grid {
    grid-template-columns: 1fr; /* Stack items vertically on mobile */
  }
  
  .perf-box {
    padding: 1.2rem 1rem;
  }

  .header {
    justify-content: center;
    text-align: center;
  }

  .title-info {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .title-label {
    text-align: center;
  }

  .perf-label {
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .perf-value {
    text-align: center;
  }

  .fee-link {
    justify-content: center;
  }

  .info-tooltip {
    margin-left: 0.25rem;
  }

  /* Adjust tooltip positioning for mobile */
  .tooltip-content {
    left: 50%;
    transform: translateX(-50%);
  }
}
</style> 