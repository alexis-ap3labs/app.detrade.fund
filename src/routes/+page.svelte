<script lang="ts">
  // Main page with vaults listing
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import VaultsCards from '$lib/components/VaultsCards.svelte';
  import FloatingHexagons from '$lib/components/FloatingHexagons.svelte';
</script>

<svelte:head>
  <title>DeTrade – Vaults</title>
  <meta name="keywords" content="DeTrade, DeFi, Trading, Cryptocurrency, Blockchain, Finance, Decentralized, Yield Farming, Automated Trading, Digital Assets, Lagoon Protocol, DeFi Vaults, Yield Vaults, USDC Vault, EURC Vault, ETH Vault, Stablecoin Yield, Ethereum Yield, High-Yield Vaults, Automated Vaults, Smart Vaults" />
  <meta name="description" content="Actively managed vaults powered by real-time data and protocol integrations. Built for performance and open to all. Access high-yield DeFi strategies with institutional-grade security." />
  <link rel="canonical" href="https://app.detrade.fund" />
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://app.detrade.fund" />
  <meta property="og:title" content="DeTrade – Vaults" />
  <meta property="og:description" content="Actively managed vaults powered by real-time data and protocol integrations. Built for performance and open to all. Access high-yield DeFi strategies with institutional-grade security." />
  <meta property="og:image" content="/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="DeTrade" />
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:domain" content="app.detrade.fund" />
  <meta name="twitter:title" content="DeTrade – Vaults" />
  <meta name="twitter:description" content="Actively managed vaults powered by real-time data and protocol integrations. Built for performance and open to all." />
  <meta property="twitter:image" content="/og-image.png" />
</svelte:head>

<Header />
<main class="main-content">
  <FloatingHexagons />
  <div class="container">
    <div class="fixed-header">
      <div class="vaults-header-row desktop-only">
        <div class="vault-header-col">Name</div>
        <div class="vault-col center">Net APR</div>
        <div class="vault-col center">30D APR</div>
        <div class="vault-col center">TVL</div>
        <div class="vault-col center">Underlying Asset</div>
        <div class="vault-col center rewards-header">
          <span class="rewards-title">Rewards</span>
          <span class="rewards-dummy">
            <span class="reward-icon-bg"></span>
            <span class="reward-icon-bg"></span>
          </span>
        </div>
      </div>
    </div>
    <div class="vaults-list">
      <VaultsCards />
    </div>
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
    overflow: hidden;
  }

  .container {
    width: 100%;
    max-width: 1800px;
    margin: 0 auto;
    padding: 1rem clamp(0.75rem, 4.9vw, 4.9rem);
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 1;
    justify-content: center;
    height: 100%;
  }

  @media (max-width: 640px) {
    .main-content {
      height: auto;
      overflow: visible;
      min-height: 100vh;
    }

    .container {
      padding-top: 2rem;
      height: auto;
    }

    .vaults-list {
      overflow: visible;
    }
  }

  .fixed-header {
    position: relative;
    z-index: 2;
    padding-bottom: 0.5rem;
    padding-top: 1rem;
  }

  .vaults-list {
    flex: 1;
    overflow: hidden;
    padding-right: 0.5rem;
    padding-top: 1rem;
  }

  .title {
    font-size: 2.5rem;
    font-weight: 600;
    margin-bottom: 5rem;
    text-align: center;
  }

  .vaults-header-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    background: transparent;
    color: #7da2c1;
    font-size: 1rem;
    font-weight: 500;
    padding-left: 1rem;
    padding-right: 1.5rem;
    gap: 3rem;
  }

  .vault-header-col {
    min-width: 320px;
    flex: 0 0 auto;
  }

  .vault-col {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .vault-col.center {
    justify-content: center;
    align-items: center;
    text-align: center;
  }

  .vaults-header-row .vault-col.center:last-child {
    min-width: 90px;
    justify-content: center;
  }

  .desktop-only {
    display: flex;
  }

  @media (max-width: 1100px) {
    .desktop-only {
      display: none;
    }
  }

  .rewards-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 1rem;
  }

  .rewards-dummy {
    display: inline-flex;
    visibility: hidden;
    margin-left: 0.25rem;
  }

  .rewards-dummy .reward-icon-bg {
    width: 24px;
    height: 24px;
    margin: 0 2px;
    background: #fff;
    border-radius: 50%;
    display: inline-block;
  }

  .rewards-title {
    margin-left: 2rem;
  }
</style> 