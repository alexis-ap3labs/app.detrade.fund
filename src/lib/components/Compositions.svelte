<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { compositionStore } from '$lib/stores/compositionStore';
  import { Doughnut } from 'svelte-chartjs';
  import Chart from 'chart.js/auto';
  import { ALL_VAULTS } from '../vaults';
  
  export let vaultId: string;

  // Find the current vault
  $: currentVault = ALL_VAULTS.find(v => v.id === vaultId);
  let mounted = false;

  async function fetchCompositionData() {
    if (!browser || !mounted) return;

    try {
      compositionStore.setLoading(true);

      // Launch both fetch requests in parallel
      const [oracleRes, debankRes] = await Promise.all([
        fetch(`/api/oracle/compositions/${vaultId}`),
        fetch(`/api/debank/compositions/${vaultId}`)
      ]);

      // Retrieve data (or undefined if error)
      const oracleData = oracleRes.ok ? await oracleRes.json() : undefined;
      const debankData = debankRes.ok ? await debankRes.json() : undefined;

      // Extract valid compositions
      const oracleComp = oracleData?.compositions;
      const debankComp = debankData?.compositions;

      // If no results, error
      if (!oracleComp && !debankComp) {
        throw new Error('No composition data found in either source');
      }

      // If only one result, use it
      let finalComp = oracleComp || debankComp;

      // If both exist, compare timestamps
      if (oracleComp && debankComp) {
        // Convert both timestamps to Date for comparison
        const t1 = new Date(oracleComp.timestamp.replace(' UTC', 'Z'));
        const t2 = new Date(debankComp.timestamp.replace(' UTC', 'Z'));
        finalComp = t1 > t2 ? oracleComp : debankComp;
      }

      // Verify that the result is valid
      if (!finalComp || !finalComp.allocation) {
        throw new Error('Invalid composition data format');
      }

      compositionStore.setComposition(vaultId, finalComp);
    } catch (error) {
      console.error('Error fetching composition data:', error);
      compositionStore.setError(error instanceof Error ? error.message : 'Unknown error');
      compositionStore.setComposition(vaultId, undefined);
    } finally {
      compositionStore.setLoading(false);
    }
  }

  onMount(() => {
    mounted = true;
    fetchCompositionData();
  });

  $: if (mounted && vaultId) {
    fetchCompositionData();
  }

  function formatValue(value: string): string {
    const num = parseFloat(value);
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(2)}K`;
    }
    return `$${num.toFixed(2)}`;
  }

  function formatLocalTime(utcString: string): string {
    // Ex: "2025-05-10 06:44:41 UTC"
    const match = utcString.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    if (!match) return utcString;
    const date = new Date(match[1] + 'Z');
    return date.toLocaleString();
  }

  // Generate sorted data with validation
  $: sortedAlloc = $compositionStore.compositions[vaultId]?.allocation
    ? Object.entries($compositionStore.compositions[vaultId]?.allocation || {})
        .filter(([, data]) => !isNaN(data.percentage) && data.percentage >= 0)
        .sort(([, a], [, b]) => b.percentage - a.percentage)
    : [];

  // Data for chart
  $: chartData = {
    labels: sortedAlloc.map(([protocol]) => protocol),
    datasets: [{
      data: sortedAlloc.map(([, data]) => data.percentage),
      backgroundColor: [
        '#E3F2FD', // very pale blue
        '#BBDEFB', // very light blue
        '#81D4FA', // pale blue
        '#64B5F6', // light blue
        '#42A5F5', // bright blue
        '#1E88E5', // main blue
        '#2196F3', // medium blue
        '#1565C0', // dark blue
        '#90CAF9', // pastel blue
        '#4FC3F7', // sky blue
      ],
      borderWidth: 0,
    }]
  };

  $: chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            // Get the allocation value (not percentage)
            const index = context.dataIndex;
            const alloc = sortedAlloc[index]?.[1];
            if (!alloc) return '';
            // If value is available, show it with the underlying token symbol
            if (alloc.value_usdc !== undefined) {
              // If it's a WETH value, display it directly
              if (alloc.value_usdc.includes('WETH')) {
                return alloc.value_usdc;
              }
              // Otherwise, format as USDC
              return `${parseFloat(alloc.value_usdc).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USDC`;
            }
            return '';
          }
        }
      }
    }
  };
</script>

<div class="compositions-outer">
  <div class="header">
    <h4 class="title-label">
      Strategy
    </h4>
  </div>
  {#if currentVault?.strategy}
    <div class="strategy-box">
      <p class="compositions-strategy-text">{currentVault.strategy}</p>
    </div>
  {/if}
  <div class="compositions-content">
    <div class="donut-box">
      <div class="donut-center">
        <div class="donut-chart">
          {#if sortedAlloc.length}
            <Doughnut data={chartData} options={chartOptions} />
          {/if}
        </div>
      </div>
      {#if $compositionStore.compositions[vaultId]}
        <div class="composition-info">
          <div class="info-row">
            <span class="info-label">ID:</span>
            <a 
              href="https://oracle.detrade.fund/{vaultId}/oracle/{$compositionStore.compositions[vaultId]?._id}" 
              target="_blank" 
              rel="noopener noreferrer"
              class="info-value link"
            >
              {$compositionStore.compositions[vaultId]?._id}
              <svg class="external-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          </div>
          <div class="info-row">
            <span class="info-label">Last update:</span>
            <span class="info-value">{formatLocalTime($compositionStore.compositions[vaultId]?.timestamp || '')}</span>
          </div>
        </div>
      {/if}
    </div>
    <div class="legend-box">
      <div class="legend-center">
        <div class="legend">
          {#each sortedAlloc as [asset, data], i}
            <div class="legend-row">
              <span class="legend-color" style="background:{chartData.datasets[0].backgroundColor[i]}"></span>
              <span class="legend-label">{data.percentage.toFixed(2)}% – {asset}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
.compositions-outer {
  width: 100%;
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
  text-align: left;
  width: 100%;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.composition-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}

.composition-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: initial;
  background: rgba(10, 34, 58, 0.503);
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 1rem 1.5rem;
}

.asset-name {
  color: #fff;
  font-size: 1rem;
  font-weight: 500;
  flex: 1 1 50%;
  text-align: left;
}

.asset-percentage {
  color: #4DA8FF;
  font-size: 1.1rem;
  font-weight: 500;
  flex: 1 1 33%;
  text-align: center;
}

.asset-value {
  color: rgba(255,255,255,0.7);
  font-size: 1.1rem;
  font-weight: 400;
  flex: 1 1 33%;
  text-align: right;
}

.loading-state, .error-state, .empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120px;
  background: rgba(10, 34, 58, 0.503);
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.loading-text, .error-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
}

.error-text {
  color: #ff4d4d;
}

.empty-state {
  color: rgba(255,255,255,0.3);
  font-size: 1rem;
}

.composition-link-row {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding-left: 0;
}

.composition-link {
  color: #4DA8FF;
  font-size: 0.95rem;
  text-decoration: underline;
  word-break: break-all;
  transition: color 0.15s;
  display: inline-flex;
  align-items: center;
}

.composition-link:hover {
  color: #82cfff;
}

.external-link-icon {
  width: 1em;
  height: 1em;
  opacity: 0.7;
}

.composition-timestamp {
  margin-top: 0.3em;
  color: rgba(255,255,255,0.5);
  font-size: 0.92rem;
  text-align: center;
}

@media (max-width: 900px) {
  .compositions-content {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 2rem;
    width: 100%;
  }
  .title-label {
    text-align: center;
  }
  .donut-box {
    display: block !important;
    width: 100% !important;
    min-width: 0;
    margin: 0 auto 0 auto;
    box-sizing: border-box;
    padding: 3rem 1.5rem 2rem 1.5rem !important;
    height: auto !important;
    min-height: unset !important;
    overflow: visible !important;
  }
  .legend-box {
    width: 100% !important;
    min-width: 0;
    margin: 0 auto 0 auto;
    box-sizing: border-box;
    padding: 2rem 1.5rem 2rem 1.5rem !important;
    height: auto !important;
    min-height: unset !important;
    overflow: visible !important;
  }
  .compositions-outer, .compositions-content {
    height: auto !important;
    min-height: unset !important;
    overflow: visible !important;
  }
  .donut-center {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 2rem 0 2.5rem 0;
  }
  .donut-chart {
    width: 260px;
    height: 260px;
    max-width: 100%;
    margin: 0 auto;
  }
  .legend-center {
    padding: 1.5rem 0 0 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .legend {
    gap: 1.2em;
    width: 100%;
    max-width: 100%;
  }
  .legend-row {
    padding: 0.75rem 1rem;
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }
  .compositions-strategy-text {
    text-align: center !important;
    margin-left: auto;
    margin-right: auto;
    display: block;
  }
}

.compositions-content {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  align-items: stretch;
  justify-content: center;
  width: 100%;
}

.donut-box, .legend-box {
  background: rgba(10, 34, 58, 0.503);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  padding: 1.5rem 2.5rem;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
}
.strategy-box > .title-label,
.donut-box > .title-label,
.legend-box > .title-label {
  margin-bottom: 1.1rem;
}
.donut-box > .title-label {
  align-self: flex-start;
  margin-bottom: 1.75rem;
}
.donut-center {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1 1 auto;
}
.donut-chart {
  width: 260px;
  height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.legend-box {
  background: rgba(10, 34, 58, 0.503);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  padding: 1.5rem 2.5rem;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
}
.legend-box > .title-label {
  align-self: flex-start;
  margin-top: 0;
  margin-bottom: 1.1rem;
}
.legend-center {
  width: 100%;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  padding: 0 1rem;
}
.legend {
  display: flex;
  flex-direction: column;
  gap: 1.1em;
  width: 100%;
  max-width: 100%;
}
.legend-row {
  background: rgba(10, 34, 58, 0.503);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.5rem;
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.7em;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
  width: 100%;
  box-sizing: border-box;
}
.legend-color {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: inline-block;
}
.info-icon {
  font-size: 1.1em;
  color: #A6F6E9;
  background: rgba(255,255,255,0.08);
  border-radius: 50%;
  width: 1.2em;
  height: 1.2em;
  display: flex;
  align-items: center;
  justify-content: center;
}
.compositions-box {
  background: transparent;
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  padding: 2.2rem 2.5rem;
  box-shadow: none;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 1.5rem;
}
.compositions-strategy-text {
  color: rgba(255, 255, 255, 0.8);
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
  margin: 0;
}

.strategy-box {
  background: rgba(10, 34, 58, 0.503);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  padding: 1.5rem 2.5rem;
  box-shadow: none;
  width: 100%;
  box-sizing: border-box;
  gap: 1rem;
}

.composition-info {
  margin-top: 2rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
  align-items: center;
  text-align: center;
  padding-bottom: 1rem;
}

.info-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}

.info-label {
  font-weight: 500;
}

.info-value {
  font-family: inherit;
}

.info-value.link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: #4DA8FF;
  text-decoration: none;
  transition: color 0.15s;
  font-family: inherit;
}

.info-value.link:hover {
  color: #82cfff;
}
</style> 