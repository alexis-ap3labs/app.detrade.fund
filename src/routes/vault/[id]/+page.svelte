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
  import Activities from '$lib/components/Activities.svelte';
  import { vaultStore } from '$lib/stores/vaultStore';

  // Récupérer les données du serveur
  export let data;

  // Récupérer l'ID du vault depuis l'URL
  const vaultId = $page.params.id;
  
  // Utiliser le vault du serveur
  const vault = data.vault;
  const network = vault ? {
    icon: vault.networkIcon,
    name: vault.network === NETWORKS.BASE.name ? NETWORKS.BASE.name : NETWORKS.ETHEREUM.name
  } : null;

  // Initialiser le vaultStore avec les données du serveur
  if (vault && data.initialData) {
    const { initialData } = data;
    
    // Initialiser TVL
    if (initialData.tvl?.latestTvl) {
      vaultStore.setTvl(vaultId, {
        tvl: initialData.tvl.latestTvl.totalAssets || '0',
        timestamp: initialData.tvl.latestTvl.timestamp || new Date().toISOString(),
        blockTimestamp: Math.floor(new Date(initialData.tvl.latestTvl.timestamp).getTime() / 1000).toString(),
        totalSupply: '0'
      });
    }

    // Initialiser Net APR
    if (initialData.netApr) {
      vaultStore.setNetApr(vaultId, {
        apr: initialData.netApr.apr,
        timestamp: new Date().toISOString()
      });
    }

    // Initialiser 30D APR
    if (initialData.thirtyDayApr) {
      vaultStore.setThirtyDayApr(vaultId, {
        apr: initialData.thirtyDayApr.apr,
        timestamp: new Date().toISOString()
      });
    }

    // Initialiser 7D APR
    if (initialData.sevenDayApr) {
      vaultStore.setSevenDayApr(vaultId, {
        apr: initialData.sevenDayApr.apr,
        timestamp: new Date().toISOString()
      });
    }

    // Initialiser Composition
    if (initialData.composition) {
      vaultStore.setComposition(vaultId, initialData.composition);
    }
  }

  // Métadonnées dynamiques
  $: pageTitle = vault ? `DeTrade – ${vault.name} Vault` : 'DeTrade – Vault';
  $: pageDescription = vault 
    ? `Explore the ${vault.name} Vault on DeTrade. Access institutional-grade DeFi strategies.`
    : 'Access high-yield DeFi strategies with institutional-grade security.';

  // Gestion des images dynamiques
  $: vaultImage = vault 
    ? `/${vault.underlyingToken.toLowerCase()}-vault.png`
    : '/og-image.png';
  $: fullImageUrl = `https://app2-gules-sigma.vercel.app${vaultImage}`;

  onMount(() => {
    if (!vault) {
      window.location.href = '/';
    }
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
  <meta name="keywords" content="DeTrade, DeFi, Trading, Cryptocurrency, Blockchain, Finance, Decentralized, Yield Farming, Automated Trading, Digital Assets, Lagoon Protocol, DeFi Vaults, Yield Vaults, {vault?.underlyingToken || 'USDC'} Vault, Stablecoin Yield, Ethereum Yield, High-Yield Vaults, Automated Vaults, Smart Vaults" />
  <link rel="canonical" href="https://app2-gules-sigma.vercel.app/vault/{vaultId}" />
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://app2-gules-sigma.vercel.app/vault/{vaultId}" />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={pageDescription} />
  <meta property="og:image" content={fullImageUrl} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="DeTrade" />
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:domain" content="app2-gules-sigma.vercel.app" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={pageDescription} />
  <meta property="twitter:image" content={fullImageUrl} />
</svelte:head>

<Header />
<main class="main-content">
  <div class="container">
    {#if vault}
      <div class="content-wrapper">
        <div class="charts-container">
          <div class="chart-box">
            <VaultHeader {vault} {network} />
          </div>
          <div class="side-container mobile-only">
            <VaultSidePanel vaultId={vaultId} />
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
          <Activities {vaultId} />
        </div>
        <div class="side-container desktop-only">
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
    overflow: hidden;
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

  .content-wrapper {
    display: flex;
    gap: 1rem;
    width: 100%;
    align-items: flex-start;
    overflow: hidden;
  }

  .charts-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 3rem;
    width: 70%;
    overflow: hidden;
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
    overflow: hidden;
  }

  .mobile-only {
    display: none;
  }

  .desktop-only {
    display: block;
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
    overflow: hidden;
  }

  @media (min-width: 1024px) {
    .charts-container {
      width: 70%;
    }
  }

  @media (max-width: 1024px) {
    .main-content {
      height: auto;
      overflow: visible;
      min-height: 100vh;
      padding-top: 4rem;
    }

    .container {
      padding: 1rem;
      height: auto;
      overflow: visible;
    }

    .content-wrapper {
      flex-direction: column;
      overflow: visible;
    }

    .charts-container {
      width: 100%;
      margin-top: 0;
      overflow: visible;
    }

    .side-container {
      width: 100%;
      position: relative;
      top: 0;
      margin-top: 0rem;
      overflow: visible;
    }

    .mobile-only {
      display: block;
    }

    .desktop-only {
      display: none;
    }

    .chart-box {
      padding: 1rem;
      overflow: hidden;
    }
  }

  @media (max-width: 640px) {
    .main-content {
      padding-top: 4.5rem;
    }

    .container {
      padding: 0.75rem;
    }

    .chart-box {
      padding: 0.75rem;
    }
  }

  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }
</style> 