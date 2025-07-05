<script lang="ts">
  // Global layout with navigation loading state
  import '../app.css';
  import { navigating } from '$app/stores';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
</script>

<svelte:head>
  <!-- App metadata -->
  <meta name="application-name" content="DeTrade" />
  <meta name="theme-color" content="#002B51" />
  <meta name="color-scheme" content="dark" />
</svelte:head>

<!-- Loading overlay during navigation -->
{#if $navigating}
  <div class="loading-overlay">
    <LoadingSpinner size="60px" />
  </div>
{/if}

<slot />

<style>
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 43, 81, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
  }
</style> 