<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { compositionStore } from '$lib/stores/compositionStore';
  import { Doughnut } from 'svelte-chartjs';
  import Chart from 'chart.js/auto';
  import { ALL_VAULTS } from '../vaults';
  
  export let vaultId: string;

  // Trouver le vault courant
  $: currentVault = ALL_VAULTS.find(v => v.id === vaultId);
  let mounted = false;

  async function fetchCompositionData() {
    if (!browser || !mounted) return;
    
    try {
      compositionStore.setLoading(true);
      const response = await fetch(`/api/oracle/compositions/${vaultId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch composition data');
      }
      const data = await response.json();
      
      // Vérifier que les données sont valides
      if (!data.compositions || !data.compositions.allocation) {
        throw new Error('Invalid composition data format');
      }
      
      compositionStore.setComposition(vaultId, data.compositions);
    } catch (error) {
      console.error('Error fetching composition data:', error);
      compositionStore.setError(error instanceof Error ? error.message : 'Unknown error');
      // Réinitialiser les données en cas d'erreur
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

  // Générer les données triées avec validation
  $: sortedAlloc = $compositionStore.compositions[vaultId]?.allocation
    ? Object.entries($compositionStore.compositions[vaultId]?.allocation || {})
        .filter(([, data]) => !isNaN(data.percentage) && data.percentage >= 0)
        .sort(([, a], [, b]) => b.percentage - a.percentage)
    : [];

  // Données pour le chart
  $: chartData = {
    labels: sortedAlloc.map(([protocol]) => protocol),
    datasets: [{
      data: sortedAlloc.map(([, data]) => data.percentage),
      backgroundColor: [
        '#E3F2FD', // bleu très pâle
        '#BBDEFB', // bleu très clair
        '#81D4FA', // bleu pâle
        '#64B5F6', // bleu clair
        '#42A5F5', // bleu vif
        '#1E88E5', // bleu principal
        '#2196F3', // bleu medium
        '#1565C0', // bleu foncé
        '#90CAF9', // bleu pastel
        '#4FC3F7', // bleu ciel
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
              // Si c'est une valeur en WETH, l'afficher directement
              if (alloc.value_usdc.includes('WETH')) {
                return alloc.value_usdc;
              }
              // Sinon, formater en USDC
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
  .composition-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 1rem 0.75rem;
  }
  .asset-name, .asset-percentage, .asset-value {
    flex: unset;
    text-align: left;
  }
}

.compositions-content {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  align-items: stretch;
  justify-content: center;
  width: 100%;
  height: 100%;
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