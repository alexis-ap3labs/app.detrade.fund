<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { fade } from 'svelte/transition';
  import { Line } from 'svelte-chartjs';
  import Chart from 'chart.js/auto';
  import 'chartjs-adapter-date-fns';
  import { pps, type PpsHistoryData, type PpsHistoryResponse } from '../stores/pps';
  import { latestPps } from '../stores/latest_pps';
  import { ALL_VAULTS } from '../vaults';

  export let vaultId: string;
  export let underlyingToken: string;

  let timeframe: 'all' | '3m' | '1m' = '3m';
  let data: PpsHistoryData[] = [];
  let loading = true;
  let isDropdownOpen = false;
  let mounted = false;
  let latestPpsValue = '0';
  let latestPpsTimestamp = '';

  onMount(() => {
    console.log('Component mounted');
    mounted = true;
    console.log('Mounted state set to true');
    console.log('Initial vaultId:', vaultId);
    console.log('Initial timeframe:', timeframe);
    if (browser) {
      fetchLatestPps();
    }
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  // Get ticker dynamically from vaults
  $: ticker = ALL_VAULTS.find(vault => vault.id === vaultId)?.ticker || '';

  // Trigger fetch when timeframe or vaultId changes
  $: if (browser && mounted) {
    console.log('Reactive statement triggered - Timeframe or vaultId changed');
    console.log('Current timeframe:', timeframe);
    console.log('Current vaultId:', vaultId);
    if (browser) {
      fetchData();
    }
  }

  // Only fetch latest PPS when vaultId changes, but only on the client side
  $: if (browser && mounted && vaultId) {
    console.log('VaultId changed, fetching latest PPS...');
    if (browser) {
      fetchLatestPps();
    }
  }

  async function fetchData() {
    if (!browser || !mounted) {
      console.log('fetchData: Not in browser or not mounted');
      return;
    }
    
    console.log('fetchData: Starting fetch for vaultId:', vaultId, 'timeframe:', timeframe);
    loading = true;
    try {
      const response = await pps.getPpsHistory(vaultId, timeframe);
      console.log('fetchData: Raw data received:', response);
      
      if (!response || !response.pps || !Array.isArray(response.pps)) {
        console.error('fetchData: Invalid data format:', response);
        data = [];
        return;
      }

      data = response.pps;
      console.log('fetchData: Data used for chart:', data);
      console.log('fetchData: Number of data points:', data.length);
      if (data.length > 0) {
        console.log('fetchData: First data point:', {
          timestamp: data[0].timestamp,
          pps: data[0].ppsFormatted,
          raw: data[0]
        });
        console.log('fetchData: Last data point:', {
          timestamp: data[data.length - 1].timestamp,
          pps: data[data.length - 1].ppsFormatted,
          raw: data[data.length - 1]
        });
        
        // Log pour le format des dates
        console.log('fetchData: Date format check:', {
          firstDate: new Date(data[0].timestamp),
          lastDate: new Date(data[data.length - 1].timestamp),
          firstDateISO: new Date(data[0].timestamp).toISOString(),
          lastDateISO: new Date(data[data.length - 1].timestamp).toISOString()
        });
      }
    } catch (error) {
      console.error('Error fetching PPS data:', error);
      data = [];
    } finally {
      loading = false;
      console.log('fetchData: Loading state set to false');
    }
  }

  async function fetchLatestPps() {
    if (!browser || !mounted) {
      console.log('fetchLatestPps: Not in browser or not mounted');
      return;
    }
    
    console.log('fetchLatestPps: Starting fetch for vaultId:', vaultId);
    try {
      const response = await fetch(`/api/vaults/${vaultId}/metrics/pps?latest=true`);
      console.log('fetchLatestPps: Response status:', response.status);
      if (!response.ok) {
        console.error('Error fetching latest PPS:', response.status);
        return;
      }
      const data = await response.json();
      console.log('fetchLatestPps: Received data:', data);
      if (data?.latestPps?.pps && data?.latestPps?.timestamp) {
        latestPpsValue = data.latestPps.pps;
        latestPpsTimestamp = data.latestPps.timestamp;
      }
    } catch (error) {
      console.error('Error fetching latest PPS:', error);
    }
  }

  $: displayPps = latestPpsValue && !isNaN(Number(latestPpsValue))
    ? Number(latestPpsValue).toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
        useGrouping: false
      })
    : '—';

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

  // Close dropdown if click outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.timeframe-selector')) {
      isDropdownOpen = false;
    }
  }

  // Update chart when data changes
  $: if (data && data.length > 0) {
    console.log('Data changed, preparing chart data');
    console.log('Data points count:', data.length);
    console.log('First data point:', data[0]);
    console.log('Last data point:', data[data.length - 1]);
    
    const chartDataPoints = data.map(d => ({
      x: new Date(d.timestamp).getTime(),
      y: d.ppsFormatted
    }));
    
    console.log('Chart data points:', chartDataPoints);
    
    chartData = {
      datasets: [
        {
          label: 'PPS',
          data: chartDataPoints,
          borderColor: '#3b82f6',
          backgroundColor: function(context: any) {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) {
              console.log('No chart area available for gradient');
              return 'rgba(59, 130, 246, 0.1)';
            }
            return getGradient(ctx, chartArea);
          },
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 0
        }
      ]
    };
  }

  // Préparer les données pour Chart.js
  function formatDateLabel(dateStr: string) {
    const [datePart] = dateStr.split(',');
    const [month, day, year] = datePart.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  }

  $: xTimeUnit = timeframe === '3m' ? 'day'
    : timeframe === '1m' ? 'day'
    : 'month';

  $: xStepSize = timeframe === '1m' ? 1 
    : timeframe === '3m' ? 3  // Display a date every 3 days in 3-month mode
    : undefined;

  $: yMin = Math.min(...data.map(d => d.ppsFormatted)) * 0.99;
  $: yMax = Math.max(...data.map(d => d.ppsFormatted)) * 1.01;

  function getGradient(ctx: CanvasRenderingContext2D, chartArea: { top: number; bottom: number }) {
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)'); // darker blue at top
    gradient.addColorStop(1, 'rgba(77, 168, 255, 0.02)'); // light blue quasi transparent at bottom
    return gradient;
  }

  $: chartData = {
    datasets: [
      {
        label: 'PPS',
        data: data.map(d => ({
          x: new Date(d.timestamp).getTime(),
          y: d.ppsFormatted
        })),
        borderColor: '#3b82f6',
        backgroundColor: function(context: any) {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) {
            console.log('No chart area available for gradient');
            return 'rgba(59, 130, 246, 0.1)';
          }
          return getGradient(ctx, chartArea);
        },
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 0
      }
    ]
  };

  $: if (chartData.datasets[0].data.length > 0) {
    console.log('Chart data prepared:', {
      pointsCount: chartData.datasets[0].data.length,
      firstPoint: chartData.datasets[0].data[0],
      lastPoint: chartData.datasets[0].data[chartData.datasets[0].data.length - 1]
    });
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
            return value.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
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
          maxTicksLimit: timeframe === '1m' ? 7 : timeframe === '3m' ? 20 : 6,
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
        display: false,
        min: yMin,
        max: yMax
      }
    },
    layout: {
      padding: {
        left: 0,
        right: 0,
        bottom: 20
      }
    }
  };

  const yAxisInsideLabelsPlugin = {
    id: 'yAxisInsideLabels',
    afterDraw(chart: any) {
      const yAxis = chart.scales['y'];
      const ctx = chart.ctx;

      // Minimum range to avoid identical labels
      let min = yAxis.min;
      let max = yAxis.max;
      if (max - min < 0.000001) {
        max = min + 0.000001;
      }

      // 3 positions at 25%, 50%, 75% of the axis
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
        const displayValue = value.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
        const y = yAxis.getPixelForValue(ticks[i]);
        ctx.fillText(displayValue, x, y);
      }
      ctx.restore();
    }
  };

  const chartAreaClipper = {
    id: 'chartAreaClipper',
    beforeDatasetsDraw(chart: any) {
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
    afterDatasetsDraw(chart: any) {
      const { ctx } = chart;
      ctx.restore();
    }
  };

  const chartAreaBorder = {
    id: 'chartAreaBorder',
    afterDraw(chart: any) {
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

<div class="pps-chart-container">
  <div class="header">
    <div class="pps-info">
      <h4 class="pps-label">Price per share</h4>
      <h3 class="chart-title">
        1 <span class="gradient-text">{ticker}</span>
        <span class="conversion-svg" style="display:inline-flex;vertical-align:middle;margin:0 0.5em;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-right"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
        </span>
        {displayPps} {underlyingToken}
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
  {:else if data.length === 0}
    <div class="loading-container">
      <span>No data available</span>
    </div>
  {:else}
    <div class="chart-wrapper">
      <Line data={chartData} options={chartOptions} plugins={[chartAreaClipper, yAxisInsideLabelsPlugin, chartAreaBorder]} />
    </div>
  {/if}
</div>

<style>
.pps-chart-container {
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.5rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 350px;
}

.pps-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pps-label {
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
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ticker {
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
  font-weight: 400;
}

.chart-wrapper {
  width: 100%;
  height: 100%;
  margin-top: 0.5rem;
  padding: 0;
  flex: 1;
  min-width: 0;
  position: relative;
  margin-left: -1.1rem;
  margin-right: -1.1rem;
  width: calc(100% + 1.5rem);
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

/* Gradient style for ticker (no glow) */
.gradient-text {
  background: linear-gradient(3deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 600;
}

.chart-box {
  width: 100%;
  background: rgba(10, 34, 58, 0.503);
  border-radius: 0.75rem;
  box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.05);
  /* Ajoute margin-top: 3rem; sur le premier chart si tu veux l'espacement du header */
}

@media (max-width: 640px) {
  .pps-chart-container {
    height: 380px;
    margin-top: 0;
    align-items: center;
    padding: 0;
    overflow: hidden;
  }

  .header {
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
    width: 100%;
    text-align: center;
  }

  .pps-info {
    width: 100%;
    align-items: center;
  }

  .pps-label {
    font-size: 0.9rem;
    text-align: center;
  }

  .chart-title {
    font-size: 1.1rem;
    flex-wrap: wrap;
    gap: 0.25rem;
    justify-content: center;
    text-align: center;
  }

  .conversion-svg {
    margin: 0 0.25em;
  }

  .conversion-svg svg {
    width: 16px;
    height: 16px;
  }

  .timeframe-selector {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .dropdown-button {
    width: 100%;
    max-width: 200px;
    justify-content: center;
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }

  .dropdown-menu {
    width: 100%;
    max-width: 200px;
    right: 50%;
    transform: translateX(50%);
  }

  .dropdown-menu button {
    text-align: center;
    justify-content: center;
    padding: 0.75rem;
  }

  .chart-wrapper {
    margin: 0;
    width: 100%;
    padding: 0;
    box-sizing: border-box;
  }

  .chart-box {
    padding: 0;
  }

  .loading-container {
    height: 200px;
    text-align: center;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
  }
}
</style> 