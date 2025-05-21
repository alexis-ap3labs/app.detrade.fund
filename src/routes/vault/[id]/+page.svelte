<script lang="ts">
  import { page } from '$app/stores';
  import { ALL_VAULTS, NETWORKS } from '$lib/vaults';
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import VaultHeader from '$lib/components/VaultHeader.svelte';
  import { tvl } from '$lib/stores/tvl';
  import { thirtyDayApr } from '$lib/stores/30d_apr';
  import { netApr } from '$lib/stores/net_apr';
  import { prices } from '$lib/stores/prices';
  import { get } from 'svelte/store';
  import TvlChart from '$lib/components/TvlChart.svelte';
  import PpsChart from '$lib/components/PpsChart.svelte';
  import Performance from '$lib/components/Performance.svelte';
  import Compositions from '$lib/components/Compositions.svelte';
  import Details from '$lib/components/Details.svelte';
  import VaultSidePanel from '$lib/components/VaultSidePanel.svelte';

  // Récupérer l'ID du vault depuis l'URL
  const vaultId = $page.params.id;
  
  // Trouver les informations du vault
  $: vault = ALL_VAULTS.find(v => v.id === vaultId);

  // Correction du nom du réseau
  $: network = vault ? { icon: vault.networkIcon, name: vault.network === NETWORKS.BASE.name ? NETWORKS.BASE.name : NETWORKS.ETHEREUM.name } : null;

  // Récupération dynamique via les stores
  $: tvlData = $tvl[vaultId];
  $: apr30dData = $thirtyDayApr[vaultId];
  $: netAprData = $netApr[vaultId];
  $: priceData = vault ? $prices[vault.underlyingToken] : undefined;
  $: tvlUsd = (tvlData?.tvl && priceData?.price) ? parseFloat(tvlData.tvl) * priceData.price : 0;
  $: netAprValue = netAprData?.data?.apr ?? 0;
  $: apr30dValue = apr30dData?.data?.apr ?? 0;

  function isTvlStale(tvlData: any) {
    if (!tvlData) return true;
    // 5 minutes
    return Date.now() - tvlData.lastUpdated > 5 * 60 * 1000;
  }

  function isAprStale(aprData: any) {
    if (!aprData) return true;
    // 5 minutes
    return Date.now() - new Date(aprData.data?.timestamp).getTime() > 5 * 60 * 1000;
  }

  onMount(() => {
    if (!vault) {
      window.location.href = '/';
    } else {
      // Charger les données publiques indépendamment de la connexion du wallet
      if (!get(thirtyDayApr)[vaultId] || isAprStale(get(thirtyDayApr)[vaultId])) {
        thirtyDayApr.setLoading(vaultId, true);
        fetch(`/api/vaults/${vaultId}/metrics/30d_apr`)
          .then(response => response.json())
          .then(data => {
            if (data.apr !== undefined) {
              thirtyDayApr.setApr(vaultId, {
                apr: data.apr,
                timestamp: new Date().toISOString()
              });
            }
          })
          .catch(error => {
            console.error(`Error fetching 30D APR for ${vaultId}:`, error);
            thirtyDayApr.setError(vaultId, 'Failed to fetch APR data');
          });
      }
      if (!get(netApr)[vaultId] || isAprStale(get(netApr)[vaultId])) {
        netApr.setLoading(vaultId, true);
        fetch(`/api/vaults/${vaultId}/metrics/net_apr`)
          .then(response => response.json())
          .then(data => {
            if (data.apr !== undefined) {
              netApr.setApr(vaultId, {
                apr: data.apr,
                startDate: data.startDate,
                endDate: data.endDate,
                totalReturn: data.totalReturn,
                timestamp: new Date().toISOString()
              });
            }
          })
          .catch(error => {
            console.error(`Error fetching Net APR for ${vaultId}:`, error);
            netApr.setError(vaultId, 'Failed to fetch APR data');
          });
      }
      if (!get(tvl)[vaultId] || isTvlStale(get(tvl)[vaultId])) {
        tvl.refreshTvl(vaultId);
      }
    }
  });
</script>

<Header />
<main class="main-content">
  <div class="container">
    {#if vault}
      <div class="content-wrapper">
        <div class="charts-container">
          <div class="chart-box">
            <VaultHeader {vault} {tvlUsd} {network} netApr={netAprValue} apr30d={apr30dValue} />
          </div>
          <div class="chart-box">
            <PpsChart {vaultId} underlyingToken={vault.underlyingToken} />
          </div>
          <div class="chart-box">
            <TvlChart {vaultId} />
          </div>
          <div class="chart-box">
            <Performance {vaultId} />
          </div>
          <div class="chart-box">
            <Compositions {vaultId} />
          </div>
          <div class="chart-box">
            <Details {vaultId} />
          </div>
        </div>
        <div class="side-container">
          <VaultSidePanel vaultId={vaultId} />
        </div>
      </div>
    {/if}
  </div>
</main>
<Footer />

<style>
  :global(html) {
    background-color: #0e111c;
  }

  :global(body) {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg,
      #002F5C 0%,
      #002B51 100%
    );
    color: white;
    overflow-y: auto;
    overscroll-behavior-y: auto;
    scroll-behavior: smooth;
    background-color: #002B51;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem 0;
    position: relative;
    z-index: 0;
    height: 100vh;
    /* overflow: hidden; */
  }

  .container {
    width: 100%;
    max-width: 1800px;
    margin: 0 auto;
    padding: 2.5rem clamp(0.75rem, 4.9vw, 4.9rem);
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 1;
    justify-content: center;
    height: 100%;
  }

  .vault-detail {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .vault-info {
    margin-top: 2rem;
    display: grid;
    gap: 2rem;
  }

  .info-section {
    background: rgba(10, 34, 58, 0.503);
    border-radius: 0.75rem;
    padding: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    color: #7da2c1;
  }

  .not-found {
    text-align: center;
    padding: 4rem 2rem;
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
  }

  .content-wrapper {
    display: flex;
    gap: 1rem;
    width: 100%;
    align-items: flex-start;
  }

  .charts-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 3rem;
    width: 70%;
  }

  .side-container {
    width: 30%;
    margin-top: 3rem;
    background: rgba(10, 34, 58, 0);
    border-radius: 0.75rem;
    box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
    height: fit-content;
    position: sticky;
    top: 2rem;
    z-index: 2;
  }

  @media (min-width: 1024px) {
    .charts-container {
      width: 70%;
    }
  }
</style> 