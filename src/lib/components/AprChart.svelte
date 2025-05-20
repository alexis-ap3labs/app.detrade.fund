<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { fade } from 'svelte/transition';
  import { Line } from 'svelte-chartjs';
  import Chart from 'chart.js/auto';
  import 'chartjs-adapter-date-fns';
  import { apr } from '../stores/apr';

  interface AprTimeSeriesPoint {
    timestamp: string;
    apr: number;
    pps: number;
  }

  interface AprData {
    averageApr: number;
    dataPoints: {
      total: number;
    };
    timeSeries: AprTimeSeriesPoint[];
  }

  export let vaultId: string;

  let timeframe: '1w' | '30d' | '90d' | 'all' = '90d';
  let loading = true;
  let isDropdownOpen = false;
  let mounted = false;

  $: latestApr = ($apr[vaultId] as AprData)?.timeSeries?.slice(-1)[0]?.apr;
  $: displayLatestApr = latestApr !== undefined ? `${latestApr.toFixed(2)}%` : '--';
  $: averageApr = ($apr[vaultId] as AprData)?.averageApr || 0;
  $: displayAverageApr = `${averageApr.toFixed(2)}%`;

  const timeframes: { label: string; value: '1w' | '30d' | '90d' | 'all' }[] = [
    { label: 'All time', value: 'all' },
    { label: '3 months', value: '90d' },
    { label: '1 month', value: '30d' },
    { label: '1 week', value: '1w' }
  ];

  function handleTimeframeSelect(value: '1w' | '30d' | '90d' | 'all') {
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

  onMount(() => {
    mounted = true;
    fetchData();
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  async function fetchData() {
    if (!browser || !mounted) return;
    
    loading = true;
    try {
      await apr.refreshTimeSeries(vaultId, timeframe);
    } catch (error) {
      console.error('Error fetching APR data:', error);
    } finally {
      loading = false;
    }
  }

  // Only fetch data when timeframe or vaultId changes, but only on the client side
  $: if (browser && mounted && (timeframe || vaultId)) {
    fetchData();
  }

  $: xTimeUnit = 'day' as const;
  $: xStepSize = timeframe === '1w' ? 1 : timeframe === '30d' ? 2 : timeframe === '90d' ? 3 : 5;

  $: yMin = 0;
  $: yMax = Math.max(...(($apr[vaultId] as AprData)?.timeSeries || []).map(d => d.apr)) * 1.1; // 10% au dessus du max

  function getGradient(ctx: CanvasRenderingContext2D, chartArea: { top: number; bottom: number }) {
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)'); // bleu plus intense en haut
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)'); // quasi transparent en bas
    return gradient;
  }

  $: chartData = {
    datasets: [
      {
        label: 'APR',
        data: (($apr[vaultId] as AprData)?.timeSeries || []).map(d => ({
          x: new Date(d.timestamp).getTime(),
          y: d.apr
        })),
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
            return `${value.toFixed(2)}%`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: xTimeUnit,
          stepSize: xStepSize,
          tooltipFormat: 'dd MMM yyyy',
          displayFormats: {
            day: 'dd MMM'
          }
        },
        grid: {
          display: false,
          drawBorder: false
        },
        offset: false,
        border: { display: false },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          maxRotation: 0,
          minRotation: 0,
          maxTicksLimit: timeframe === '1w' ? 7 : timeframe === '30d' ? 12 : timeframe === '90d' ? 6 : 5
        }
      },
      y: {
        display: false,
        min: 0,
        max: yMax
      }
    },
    layout: {
      padding: {
        right: 1
      }
    }
  };

  const yAxisInsideLabelsPlugin = {
    id: 'yAxisInsideLabels',
    afterDraw(chart: Chart) {
      const yAxis = chart.scales['y'];
      const ctx = chart.ctx;

      // Range minimum pour éviter les labels identiques
      let min = yAxis.min;
      let max = yAxis.max;
      if (max - min < 1) {
        max = min + 1;
      }

      // 3 positions à 25%, 50%, 75% de l'axe
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
        const displayValue = `${value.toFixed(2)}%`;
        const y = yAxis.getPixelForValue(ticks[i]);
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

  // Plugin pour la ligne de moyenne
  const averageLinePlugin = {
    id: 'averageLine',
    afterDraw(chart: Chart) {
      const avg = averageApr;
      if (!chart.scales || !chart.scales.y || isNaN(avg)) return;
      const yScale = chart.scales.y;
      const ctx = chart.ctx;
      const chartArea = chart.chartArea;
      if (!chartArea) return;
      const y = yScale.getPixelForValue(avg);

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([1, 5]); // Presque des points
      ctx.strokeStyle = '#60a5fa'; // Couleur bleu clair
      ctx.lineWidth = 1.2;
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tooltip style à droite, très compact, SOUS la ligne
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const label = `Avg ${avg.toFixed(2)}%`;
      const paddingX = 6;
      const paddingY = 2;
      const textWidth = ctx.measureText(label).width;
      const rectHeight = 16;
      const rectWidth = textWidth + paddingX * 2;
      const x = chartArea.right - rectWidth - 8;
      const yRect = y + 6; // 6px sous la ligne

      // Ombre légère
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.10)';
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.roundRect(x, yRect, rectWidth, rectHeight, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Texte
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + paddingX, yRect + rectHeight / 2);
      ctx.restore();
    }
  };
</script>

<div class="apr-chart-container">
  <div class="header">
    <div class="apr-info">
      <h4 class="apr-label">30D APR</h4>
      <h3 class="chart-title">{displayLatestApr}</h3>
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
      <Line data={chartData} options={chartOptions} plugins={[chartAreaClipper, yAxisInsideLabelsPlugin, chartAreaBorder, averageLinePlugin]} />
    </div>
  {/if}
</div>

<style>
.apr-chart-container {
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.5rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 400px;
}

.chart-title {
  color: #fff;
  font-size: 1.5rem;
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

.title-container {
  display: flex;
  flex-direction: column;
}

.apr-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.apr-label {
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
</style> 