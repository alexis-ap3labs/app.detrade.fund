<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { fade } from 'svelte/transition';
  import { Line } from 'svelte-chartjs';
  import Chart from 'chart.js/auto';
  import 'chartjs-adapter-date-fns';
  import { tvl } from '../stores/tvl';
  import { prices } from '../stores/prices';
  import { ALL_VAULTS } from '../vaults';

  export let vaultId: string;

  let timeframe: 'all' | '3m' | '1m' = '3m';
  let data: { timestamp: string; totalAssets: string }[] = [];
  let loading = true;
  let isDropdownOpen = false;
  let latestTvlFromApi = '0';
  let mounted = false;
  let lastTvlPoint: { timestamp: string; totalAssets: string } | null = null;
  let lastTvlTimestamp: number | null = null;
  let filteredData: { timestamp: string; totalAssets: string }[] = [];
  let uniqueFilteredData: { timestamp: string; totalAssets: string }[] = [];

  // Get underlying token from vaults
  $: underlyingToken = ALL_VAULTS.find(vault => vault.id === vaultId)?.underlyingToken || 'USDC';

  async function fetchLatestTvl() {
    if (!browser || !mounted) return;
    
    try {
      const response = await fetch(`/api/vaults/${vaultId}/metrics/tvl?latest=true`);
      const data = await response.json();
      latestTvlFromApi = data.latestTvl?.totalAssets || '0';
    } catch (error) {
      console.error('Error fetching latest TVL:', error);
      latestTvlFromApi = '0';
    }
  }

  $: if (data && data.length > 0) {
    const sorted = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    lastTvlPoint = sorted[sorted.length - 1];
  } else {
    lastTvlPoint = null;
  }

  const timeframes: { label: string; value: 'all' | '3m' | '1m' }[] = [
    { label: 'All time', value: 'all' },
    { label: '3 months', value: '3m' },
    { label: '1 month', value: '1m' }
  ];

  function handleTimeframeSelect(value: 'all' | '3m' | '1m') {
    timeframe = value;
    isDropdownOpen = false;
  }

  function toggleDropdown() {
    isDropdownOpen = !isDropdownOpen;
  }

  // Fermer le dropdown si on clique en dehors
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.timeframe-selector')) {
      isDropdownOpen = false;
    }
  }

  async function fetchData() {
    if (!browser || !mounted) return;
    
    loading = true;
    try {
      data = await tvl.getTvlHistory(vaultId, timeframe);
    } catch (error) {
      console.error('Error fetching TVL data:', error);
      data = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    mounted = true;
    fetchLatestTvl();
    fetchData();
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  // Only fetch data when timeframe or vaultId changes, but only on the client side
  $: if (browser && mounted && (timeframe || vaultId)) {
    fetchData();
  }

  // Only fetch latest TVL when vaultId changes, but only on the client side
  $: if (browser && mounted && vaultId) {
    fetchLatestTvl();
  }

  // Préparer les données pour Chart.js
  function formatDateLabel(dateStr: string) {
    // Support format 'MM/DD/YYYY, HH:mm:ss'
    // Exemple : '10/03/2025, 08:00:00'
    const [datePart] = dateStr.split(',');
    const [month, day, year] = datePart.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  }

  $: xTimeUnit = timeframe === '3m' ? 'day'
    : timeframe === '1m' ? 'day'
    : 'month';

  $: xStepSize = timeframe === '1m' ? 2 
    : timeframe === '3m' ? 3  // Afficher une date tous les 3 jours en mode 3 mois
    : undefined;

  $: yMin = Math.min(...data.map(d => parseFloat(d.totalAssets)));
  $: yMax = Math.max(...data.map(d => parseFloat(d.totalAssets)));
  // Ajoute une vraie marge en haut (15% de la plage)
  $: {
    const range = yMax - yMin;
    if (range < 0.0001) {
      yMin = yMin - 0.0001;
      yMax = yMax + 0.0001;
    } else {
      yMax = yMax + range * 0.15;
      yMin = Math.max(0, yMin - range * 0.02);
    }
  }

  function getGradient(ctx: CanvasRenderingContext2D, chartArea: { top: number; bottom: number }) {
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)'); // bleu plus foncé en haut
    gradient.addColorStop(1, 'rgba(77, 168, 255, 0.02)'); // bleu clair quasi transparent en bas
    return gradient;
  }

  $: lastTvlTimestamp = data.length > 0
    ? Math.max(...data.map(d => new Date(d.timestamp).getTime()))
    : null;

  $: filteredData = lastTvlTimestamp
    ? data.filter(d => new Date(d.timestamp).getTime() <= lastTvlTimestamp)
    : data;

  $: uniqueFilteredData = [];
  if (filteredData && filteredData.length > 0) {
    const seen = new Set();
    for (let i = filteredData.length - 1; i >= 0; i--) {
      const ts = filteredData[i].timestamp;
      if (!seen.has(ts)) {
        uniqueFilteredData.unshift(filteredData[i]);
        seen.add(ts);
      }
    }
  } else {
    uniqueFilteredData = filteredData;
  }

  $: if (uniqueFilteredData && uniqueFilteredData.length > 0) {
    // Trie les données par date croissante et prend le dernier point
    const sorted = [...uniqueFilteredData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    lastTvlPoint = sorted[sorted.length - 1];
  } else {
    lastTvlPoint = null;
  }

  $: chartData = {
    datasets: [
      {
        label: 'TVL',
        data: data
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .map(d => {
            console.log('Processing data point:', d);
            return {
              x: new Date(d.timestamp).getTime(),
              y: parseFloat(d.totalAssets)
            };
          }),
        borderColor: '#3b82f6',
        backgroundColor: function(context: any) {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(59, 130, 246, 0.1)';
          return getGradient(ctx, chartArea);
        },
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 0
      }
    ]
  };

  // Format value based on token
  function formatValue(value: number, token: string): string {
    if (vaultId === 'detrade-core-eth') {
      return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    if (token === 'ETH') {
      return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  // Format USD value
  function formatUsdValue(value: number): string {
    if (vaultId === 'detrade-core-eth') {
      if (value >= 1000000) {
        return `$${(value / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
      } else if (value >= 1000) {
        return `$${(value / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
      }
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    if (value >= 1000000) {
      return `$${(value / 1000000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
    }
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  $: chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        titleColor: '#fff',
        bodyColor: 'rgba(255, 255, 255, 0.7)',
        titleFont: {
          size: 13,
          weight: 'normal' as const
        },
        bodyFont: {
          size: 13
        },
        displayColors: false,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y;
            return `${formatValue(value, underlyingToken)} ${underlyingToken}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: xTimeUnit as 'day' | 'week' | 'month',
          ...(xStepSize ? { stepSize: xStepSize } : {}),
          tooltipFormat: 'dd MMM yyyy',
          displayFormats: {
            week: 'dd MMM',
            day: 'dd MMM',
            month: 'MMM yyyy'
          }
        },
        grid: {
          display: true,
          color: 'rgba(255, 255, 255, 0.05)',
          drawBorder: false
        },
        offset: false,
        border: { display: false },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          maxRotation: 0,
          minRotation: 0,
          maxTicksLimit: timeframe === '1m' ? 7 : timeframe === '3m' ? 20 : 6,  // Augmenté à 20 pour le mode 3 mois
          autoSkip: false,
          padding: 10,
          font: {
            size: 12
          }
        },
        display: true,
        position: 'bottom' as const
      },
      y: {
        type: 'linear' as const,
        display: false,
        min: yMin,
        max: yMax,
        grid: {
          display: true,
          color: 'rgba(255, 255, 255, 0.05)',
          drawBorder: false
        },
        border: { display: false },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          padding: 8,
          callback: function(this: any, value: number) {
            if (vaultId === 'detrade-core-usdc') {
              return `$${(value / 1000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}K`;
            }
            return value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
          }
        }
      }
    },
    layout: {
      padding: {
        right: 1,
        bottom: 20
      }
    }
  };

  const yAxisInsideLabelsPlugin = {
    id: 'yAxisInsideLabels',
    afterDraw(chart: any) {
      const yAxis = chart.scales['y'];
      const ctx = chart.ctx;

      let min = yAxis.min;
      let max = yAxis.max;
      if (max - min < 1e-6) {
        max = min + 1e-6;
      }

      // 3 positions à 25%, 50%, 75% de l'axe (comme PpsChart)
      const positions = [0.25, 0.5, 0.75];
      const ticks = positions.map(p => min + p * (max - min));

      ctx.save();
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';

      const x = yAxis.left + 8;
      for (let i = 0; i < ticks.length; i++) {
        const value = ticks[i];
        let displayValue;
        if (vaultId === 'detrade-core-usdc') {
          displayValue = `$${(value / 1000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}K`;
        } else {
          displayValue = value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        }
        const y = yAxis.getPixelForValue(value);
        ctx.fillText(displayValue, x, y);
      }
      ctx.restore();
    }
  };

  const chartAreaClipper = {
    id: 'chartAreaClipper',
    beforeDatasetsDraw(chart: Chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.beginPath();
      const radius = 14;
      const { left, top, right, bottom } = chartArea;
      ctx.moveTo(left + radius, top);
      ctx.lineTo(right - radius, top);
      ctx.quadraticCurveTo(right, top, right, top + radius);
      ctx.lineTo(right, bottom - radius);
      ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
      ctx.lineTo(left + radius, bottom);
      ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
      ctx.lineTo(left, top + radius);
      ctx.quadraticCurveTo(left, top, left + radius, top);
      ctx.closePath();
      ctx.clip();
    },
    afterDatasetsDraw(chart: Chart) {
      const { ctx } = chart;
      ctx.restore();
    }
  };

  const chartAreaBorder = {
    id: 'chartAreaBorder',
    afterDraw(chart: Chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.beginPath();
      const radius = 14;
      const { left, top, right, bottom } = chartArea;
      ctx.moveTo(left + radius + 1, top + 1);
      ctx.lineTo(right - radius - 1, top + 1);
      ctx.quadraticCurveTo(right - 1, top + 1, right - 1, top + radius + 1);
      ctx.lineTo(right - 1, bottom - radius - 1);
      ctx.quadraticCurveTo(right - 1, bottom - 1, right - radius - 1, bottom - 1);
      ctx.lineTo(left + radius + 1, bottom - 1);
      ctx.quadraticCurveTo(left + 1, bottom - 1, left + 1, bottom - radius - 1);
      ctx.lineTo(left + 1, top + radius + 1);
      ctx.quadraticCurveTo(left + 1, top + 1, left + radius + 1, top + 1);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  };
</script>

<div class="tvl-chart-container">
  <div class="header">
    <div class="tvl-info">
      <h4 class="tvl-label">TVL</h4>
      <h3 class="chart-title">
        {lastTvlPoint ? `${formatValue(parseFloat(lastTvlPoint.totalAssets), underlyingToken)} ${underlyingToken}` : `0 ${underlyingToken}`}
        <span class="conversion-svg" style="display:inline-flex;vertical-align:middle;margin:0 0.5em;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-right"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
        </span>
        {lastTvlPoint ? formatUsdValue(parseFloat(lastTvlPoint.totalAssets) * ($prices[underlyingToken]?.price || 1)) : '$0'}
      </h3>
    </div>
    <div class="timeframe-selector">
      <button class="dropdown-button" on:click={toggleDropdown}>
        {timeframes.find(tf => tf.value === timeframe)?.label}
        <svg class="dropdown-arrow" class:open={isDropdownOpen} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      {#if isDropdownOpen}
        <div class="dropdown-menu" transition:fade>
          {#each timeframes as tf}
            <button
              class:active={tf.value === timeframe}
              on:click={() => handleTimeframeSelect(tf.value)}
            >
              {tf.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  {#if loading}
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <span>Loading chart data...</span>
    </div>
  {:else}
    <div class="chart-wrapper">
      <Line data={chartData} options={chartOptions} plugins={[chartAreaClipper, yAxisInsideLabelsPlugin, chartAreaBorder]} />
    </div>
  {/if}
</div>

<style>
.tvl-chart-container {
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.5rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 350px;
}

.tvl-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tvl-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.02em;
}

.chart-title {
  color: #fff;
  font-size: 1.25rem;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.02em;
}

.chart-wrapper {
  width: 100%;
  height: 100%;
  margin-top: 0.5rem;
  padding: 0;
  flex: 1;
  min-width: 0;
  position: relative;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.timeframe-selector {
  position: relative;
}

.dropdown-button {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.15s ease;
}

.dropdown-button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.15);
}

.dropdown-arrow {
  transition: transform 0.15s ease;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.25rem;
  min-width: 140px;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.dropdown-menu button {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  padding: 0.5rem 0.75rem;
  border-radius: 0.35rem;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.15s ease;
}

.dropdown-menu button:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.dropdown-menu button.active {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 250px;
  color: rgba(255, 255, 255, 0.5);
  gap: 0.75rem;
}

.loading-spinner {
  width: 32px;
  height: 32px;
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
</style> 