<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import WalletConnect from './WalletConnect.svelte';
    import { wallet } from '$lib/stores/wallet';
    import { fade } from 'svelte/transition';
    import { onDestroy, onMount } from 'svelte';
    import NumberRoll from './NumberRoll.svelte';
    import { prices } from '$lib/stores/prices';
    
    let isHeaderVisible = true;
    let lastScrollY = 0;
    let errorTimeout: NodeJS.Timeout;
    let tvlValue: string | number = "0";
    let isTvlLoading = true;
    let tvlUsdValue: number = 0;
    let isPriceLoading = true;
    let isInitialized = false;
  
    if (typeof window !== 'undefined') {
      const handleScroll = () => {
        const currentScrollY = window.scrollY;
        isHeaderVisible = currentScrollY <= 100 || (currentScrollY < lastScrollY && currentScrollY <= 100);
        lastScrollY = currentScrollY;
      };
      
      window.addEventListener('scroll', handleScroll);
      
      onDestroy(() => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('scroll', handleScroll);
        }
      });
    }
  
    $: isAppRoute = true;
  
    function handleError() {
      if (errorTimeout) clearTimeout(errorTimeout);
      if ($wallet.error) {
        errorTimeout = setTimeout(() => {
          wallet.clearError();
        }, 10000);
      }
    }
  
    $: if ($wallet.error !== null) handleError();
  
    onDestroy(() => {
      if (errorTimeout) clearTimeout(errorTimeout);
    });
  
    $: error = $wallet.error;

    async function fetchTVL() {
      if (!isInitialized) {
        isTvlLoading = true;
        isPriceLoading = true;
      }

      try {
        // Récupérer la TVL et le prix en parallèle
        const [tvlResponse, usdcPrice] = await Promise.all([
          fetch('/api/vault/detrade-core-usdc/tvl'),
          prices.getPrice('USDC')
        ]);
        
        if (!tvlResponse.ok) {
          throw new Error(`HTTP error! status: ${tvlResponse.status}`);
        }
        
        const data = await tvlResponse.json();
        tvlValue = data.tvl;
        tvlUsdValue = Number(tvlValue) * usdcPrice;
      } catch (error) {
        console.error('Error fetching TVL:', error);
        tvlValue = "Error";
        tvlUsdValue = 0;
      } finally {
        isTvlLoading = false;
        isPriceLoading = false;
        isInitialized = true;
      }
    }

    onMount(() => {
      // Commencer le chargement immédiatement
      fetchTVL();
      
      // Mettre à jour la TVL toutes les 5 minutes
      const interval = setInterval(fetchTVL, 300000);
      
      return () => clearInterval(interval);
    });
</script>
  
{#if isAppRoute}
<header class:hidden={!isHeaderVisible}>
  <div class="header-content">
    <div class="logo-section">
      <img 
        src="/detrade-text.webp" 
        alt="DeTrade" 
        class="logo" 
        on:click={() => goto('/')}
      />
    </div>
    <div class="header-right">
      <div class="wallet-section">
        <WalletConnect />
      </div>
    </div>
  </div>
</header>
{/if}
  
<style>
    header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      z-index: 100;
      padding: 1rem 0;
      background: transparent;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      transform: translateY(0);
    }

    header.hidden {
      transform: translateY(-100%);
    }

    .header-content {
      width: 100%;
      max-width: 1800px;
      margin: 0 auto;
      padding: 0 clamp(2.5rem, 10vw, 5rem);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-lg, 2rem);
      position: relative;
      min-height: 40px;
      height: 40px;
    }
  
    .logo-section {
      display: flex;
      align-items: center;
      gap: 2rem;
    }
  
    .logo {
      height: clamp(24px, 4vw, 32px);
      width: auto;
      object-fit: contain;
      transition: all 0.3s ease;
    }
  
    .logo:hover {
      opacity: 0.8;
    }
  
    .wallet-section {
      display: flex;
      align-items: center;
      gap: 1rem;
      position: relative;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
      position: relative;
    }

    .tvl-badge {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      white-space: nowrap;
      transition: all 0.3s ease;
      height: 100%;
      padding: 0.2rem 0.4rem;
    }

    .label {
      /* Typographie */
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1;
      
      /* Couleur */
      color: #b4c6ef;
      
      /* Transitions */
      transition: color 0.2s ease;
      
      /* Espacement */
      margin: 0;
      padding: 0;
      
      /* Alignement */
      display: inline-block;
      vertical-align: middle;
    }

    .separator {
      color: #b4c6ef;
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1;
      margin: 0;
      padding: 0;
      display: inline-block;
      vertical-align: middle;
    }

    .value {
      /* Dimensions de base */
      min-width: 80px;
      height: 1.2em;
      border-radius: 4px;
      
      /* Style de la valeur */
      background: linear-gradient(135deg, #fff 0%, #4DA8FF 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-size: 0.875rem;
      font-weight: 600;
      text-shadow: 0 0 20px rgba(77, 168, 255, 0.5);
      
      /* Espacement */
      padding: 0.2rem 0.4rem;
      line-height: 1;
      
      /* Transitions */
      transition: all 0.3s ease;
      
      /* Alignement */
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tvl-badge:hover .label,
    .tvl-badge:hover .separator {
      color: #ffffff;
    }

    .shimmer {
      position: relative;
      overflow: hidden;
      background: rgba(13, 25, 42, 0.7);
      filter: blur(0.5px);
    }

    .shimmer::after {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      transform: translateX(-100%);
      background-image: linear-gradient(
        90deg,
        transparent 0,
        rgba(77, 168, 255, 0.1) 20%,
        rgba(255, 255, 255, 0.2) 60%,
        transparent
      );
      animation: shimmer 2s infinite;
      content: '';
    }

    @keyframes shimmer {
      100% {
        transform: translateX(100%);
      }
    }
  
    @media (max-width: 1200px) {
      .tvl-badge {
        opacity: 0;
        pointer-events: none;
      }
      
      .logo-section {
        gap: 1rem;
      }
    }

    @media (max-width: 640px) {
      header {
        padding: 0.75rem 0;
      }
      
      .header-content {
        height: 32px;
      }

      .container {
        padding-inline: 1rem;
      }
  
      .logo {
        height: 28px;
      }
    }
  
    .error-message,
    .error-message a,
    .error-message a:visited,
    .error-message a:hover {
      display: none;
    }
  
    .launch-btn {
      background: linear-gradient(135deg, #fff 0%, #4DA8FF 100%);
      color: #0d111c;
      border: none;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      min-width: 120px;
      box-shadow: 
        0 4px 15px rgba(77, 168, 255, 0.3),
        0 0 25px rgba(77, 168, 255, 0.5);
    }
  
    .launch-btn:hover {
      transform: translateY(-2px);
      box-shadow: 
        0 6px 20px rgba(77, 168, 255, 0.4),
        0 0 30px rgba(77, 168, 255, 0.6);
    }

    .dashboard-link {
      color: #b4c6ef;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: color 0.2s ease;
    }

    .dashboard-link:hover {
      color: #ffffff;
    }
</style> 