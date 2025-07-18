<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import WalletConnect from './WalletConnect.svelte';
    import { wallet } from '$lib/stores/wallet';
    import { fade } from 'svelte/transition';
    import { onDestroy, onMount } from 'svelte';
    import NumberRoll from './NumberRoll.svelte';
    import { prices } from '$lib/stores/prices';
    import { fly } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    
    // Header visibility state and scroll tracking
    let isHeaderVisible = true;
    let lastScrollY = 0;
    let errorTimeout: NodeJS.Timeout;
  
    // Auto-hide header on scroll down, show on scroll up
    if (typeof window !== 'undefined') {
      const handleScroll = () => {
        const currentScrollY = window.scrollY;
        // Show header if at top or scrolling up within threshold
        isHeaderVisible = currentScrollY <= 25 || (currentScrollY < lastScrollY && currentScrollY <= 25);
        lastScrollY = currentScrollY;
      };
      
      window.addEventListener('scroll', handleScroll);
      
      onDestroy(() => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('scroll', handleScroll);
        }
      });
    }
  
    // App route detection (currently always true for this layout)
    $: isAppRoute = true;
  
    // Auto-dismiss wallet connection errors after 10 seconds
    function handleError() {
      if (errorTimeout) clearTimeout(errorTimeout);
      if ($wallet.error) {
        errorTimeout = setTimeout(() => {
          wallet.clearError();
        }, 10000);
      }
    }
  
    // Watch for wallet errors and trigger auto-dismiss
    $: if ($wallet.error !== null) handleError();
  
    onDestroy(() => {
      if (errorTimeout) clearTimeout(errorTimeout);
    });
  
    $: error = $wallet.error;
</script>
  
{#if isAppRoute}
<header class:hidden={!isHeaderVisible}>
  <div class="header-content">
    <div class="logo-section">
      <img 
        src="/detrade-text.webp" 
        alt="DeTrade" 
        class="logo" 
        on:click={() => {
          console.log('[Header] Logo clicked, navigating to home');
          goto('/');
        }}
        role="button"
        tabindex="0"
      />
      {#if $page.url.pathname !== '/'}
        <a href="/" class="nav-link desktop" on:click={(e) => {
          console.log('[Header] Vaults link clicked');
          e.preventDefault();
          goto('/');
        }} role="button" tabindex="0">Vaults</a>
      {:else}
        <span class="nav-link desktop disabled">Portfolio</span>
      {/if}
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
      background: rgba(10, 34, 58, 0.4);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      transform: translateY(0);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
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
      min-height: 48px;
      height: 48px;
    }
  
    .logo-section {
      display: flex;
      align-items: center;
      gap: 2.5rem;
      padding-left: 0.5rem;
    }
  
    .logo {
      height: clamp(38.8px, 4.8vw, 38.4px);
      width: auto;
      object-fit: contain;
      transition: all 0.3s ease;
      cursor: pointer;
      filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.3));
    }
  
    .logo:hover {
      opacity: 1;
      transform: scale(1.02);
      filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.4));
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

    @media (max-width: 1200px) {
      .logo-section {
        gap: 1.5rem;
      }
    }

    @media (max-width: 640px) {
      header {
        padding: 0.5rem 0;
        background: rgba(255, 255, 255, 0.08);
        margin-bottom: 1.5rem;
      }
      
      .header-content {
        height: 40px;
        padding: 0 1rem;
        gap: 0.5rem;
      }

      .logo {
        height: 24px;
      }

      .nav-link.desktop {
        display: none;
      }

      .wallet-section {
        margin-left: auto;
      }

      .connect-btn {
        font-size: 0.875rem;
        padding: 0.5rem 1rem;
        min-width: 120px;
        width: auto;
        height: 36px;
      }

      .header-right {
        gap: 0.5rem;
      }
    }

    @media (max-width: 480px) {
      .header-content {
        padding: 0 0.75rem;
      }

      .connect-btn {
        min-width: 110px;
        padding: 0.5rem 0.75rem;
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

    .vaults-btn {
      background: linear-gradient(135deg, #4DA8FF 0%, #fff 100%);
      color: #0d111c;
      border: none;
      padding: 0.5rem 1.25rem;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      min-width: 80px;
      box-shadow: 0 2px 8px rgba(77, 168, 255, 0.15);
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .vaults-btn:hover {
      opacity: 0.85;
      transform: translateY(-1px) scale(1.03);
      box-shadow: 0 4px 16px rgba(77, 168, 255, 0.25);
    }

    .nav-link {
      color: #b4c6ef;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: color 0.2s;
      cursor: pointer;
    }

    .nav-link:hover {
      color: #ffffff;
    }

    .nav-link.desktop {
      display: inline-block;
      font-size: 1rem;
      font-weight: 600;
      color: #ffffff;
      font-family: inherit;
      letter-spacing: inherit;
      position: relative;
      padding: 0.5rem 1.25rem;
      transition: all 0.3s ease;
      background: rgba(10, 34, 58, 0.503);
      border-radius: 0.75rem;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
    }

    .nav-link.desktop:hover {
      color: #ffffff;
      transform: translateY(-2px);
      background: rgba(10, 34, 58, 0.7);
      border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }

    .nav-link.desktop:active {
      transform: translateY(0);
      background: rgba(10, 34, 58, 0.503);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    }

    /* Menu mobile */
    .hamburger,
    .hamburger .bar,
    .mobile-menu,
    .nav-link.mobile {
      display: none;
    }

    @media (min-width: 641px) {
      .mobile-menu {
        display: none;
      }
    }

    .nav-link.desktop.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .nav-link.desktop.disabled:hover {
      transform: none;
      background: rgba(10, 34, 58, 0.503);
      box-shadow: none;
    }
</style> 