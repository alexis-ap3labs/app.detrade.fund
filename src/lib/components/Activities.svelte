<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { ALL_VAULTS, NETWORKS } from '../vaults';
  import { pps } from '$lib/stores/pps';
  
  export let vaultId: string;

  interface Activity {
    id?: string;
    owner?: string;
    type: string;
    createdAt: string;
    amount?: string | number;
    assets?: string | number;
    shares?: string | number;
    totalAssets?: string | number;
    sharesBurned?: string | number;
    sharesMinted?: string | number;
    totalSupply?: string | number;
    transactionHash?: string | null;
  }

  interface ActivityResponse {
    success: boolean;
    data: Activity[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
    error?: string;
  }

  // Trouver le vault courant
  $: currentVault = ALL_VAULTS.find(v => v.id === vaultId);
  let activities: Activity[] = [];
  let loading = false;
  let error: string | null = null;
  let currentPage = 1;
  let hasMore = true;
  let initialLoad = true;
  let showError = false;
  const tabs = ['Deposit', 'Withdraw', 'Valuation', 'Settlement'] as const;
  type TabType = typeof tabs[number];
  let activeTab: TabType = 'Deposit';

  let documentsList: HTMLElement;

  function scrollLeft() {
    if (documentsList) {
      documentsList.scrollBy({ left: -documentsList.offsetWidth, behavior: 'smooth' });
    }
  }

  function scrollRight() {
    if (documentsList) {
      documentsList.scrollBy({ left: documentsList.offsetWidth, behavior: 'smooth' });
    }
  }

  function isSettlementTab(tab: TabType): tab is 'Settlement' {
    return tab === 'Settlement';
  }

  function isValuationOrSettlementTab(tab: TabType): boolean {
    return tab === 'Valuation' || tab === 'Settlement';
  }

  const typeMapping: Record<string, string> = {
    'Deposit': 'depositRequest',
    'Withdraw': 'redeemRequest',
    'Valuation': 'newTotalAssetsUpdated',
    'Settlement': 'settleDeposit,settleRedeem,totalAssetsUpdated'
  };

  const itemsPerPage = 20;

  async function loadMore() {
    if (loading || !hasMore) return;
    try {
      loading = true;
      const type = typeMapping[activeTab];
      const url = `/api/activities/${vaultId}?page=${currentPage}&limit=${itemsPerPage}&type=${type}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ActivityResponse = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to load activities');
      }
      
      // Trier les activités par date de création (plus récent en premier)
      const sortedData = data.data.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      activities = [...activities, ...sortedData];
      
      hasMore = data.data.length === itemsPerPage;
      currentPage += 1;
      error = null;
      showError = false;
    } catch (err) {
      console.error('Error loading activities:', err);
      error = err instanceof Error ? err.message : 'Failed to load more activities. Please try again later.';
      setTimeout(() => { showError = true; }, 500);
    } finally {
      loading = false;
      initialLoad = false;
    }
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    const bottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    if (bottom && !loading && hasMore) {
      loadMore();
    }
  }

  async function fetchInitialActivities() {
    activities = [];
    currentPage = 1;
    hasMore = true;
    initialLoad = true;
    await loadMore();
  }

  function getTimeAgo(timestamp: string | number) {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) throw new Error('Invalid date');
      
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (diffInSeconds < 60) return 'just now';
      
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
      
      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
      
      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
      
      const diffInMonths = Math.floor(diffInDays / 30);
      if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
      
      const diffInYears = Math.floor(diffInMonths / 12);
      return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
    } catch (e) {
      console.error('Error parsing date:', e);
      return 'Invalid date';
    }
  }

  function formatAddress(address: string | undefined): string {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function formatHash(hash: string | undefined): string {
    if (!hash) return 'Unknown';
    // On prend les 6 premiers caractères et les 4 derniers, peu importe la longueur totale
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  }

  function formatAmountByToken(amount: string | number | undefined, token: string | undefined): string {
    if (!amount) return '0';
    if (!token) return amount.toString();
    
    // Pour les parts du vault (shares), on utilise toujours 18 décimales
    if (activeTab === 'Withdraw') {
      try {
        const val = typeof amount === 'string' ? amount : amount.toString();
        const shares = parseFloat(val) / Math.pow(10, 18);
        return shares.toLocaleString(undefined, { maximumFractionDigits: 2 });
      } catch (e) {
        console.error('Error formatting withdraw amount:', e);
        return '0';
      }
    }

    // Pour les autres cas, on utilise les décimales du token sous-jacent
    let decimals = currentVault?.underlyingTokenDecimals || 18;
    try {
      const val = typeof amount === 'string' ? amount : amount.toString();
      console.log('Raw amount:', val, 'Decimals:', decimals);
      
      // Pour l'USDC, on utilise toujours 6 décimales
      if (token === 'USDC') {
        decimals = 6;
      }
      
      const formatted = parseFloat(val) / Math.pow(10, decimals);
      console.log('Formatted amount:', formatted);
      
      // Pour Valuation, on force 2 décimales pour tous les tokens
      if (activeTab === 'Valuation') {
        const result = formatted.toLocaleString(undefined, { 
          minimumFractionDigits: 2,
          maximumFractionDigits: 2 
        });
        console.log('Final result:', result);
        return result;
      }
      
      // Pour les autres cas, on utilise les décimales appropriées selon le token
      return formatted.toLocaleString(undefined, { 
        maximumFractionDigits: decimals === 6 ? 2 : 6 
      });
    } catch (e) {
      console.error('Error formatting amount:', e);
      return '0';
    }
  }

  function formatTimestamp(ts: string | number | undefined): string {
    if (!ts) return 'N/A';
    try {
      // blockTimestamp est un timestamp unix en secondes (string)
      const t = typeof ts === 'string' ? parseInt(ts) : ts;
      if (isNaN(Number(t))) return 'Invalid date';
      const date = new Date(Number(t) * 1000);
      return date.toLocaleString();
    } catch {
      return 'Invalid date';
    }
  }

  function getExplorerBaseUrl(): string {
    const network = String(currentVault?.network);
    if (network === NETWORKS.ETHEREUM.name) {
      return 'https://etherscan.io/tx/';
    } else if (network === NETWORKS.BASE.name) {
      return 'https://basescan.org/tx/';
    }
    // Par défaut Ethereum
    return 'https://etherscan.io/tx/';
  }

  function getAddressExplorerUrl(address: string | undefined): string {
    const network = String(currentVault?.network);
    if (network === NETWORKS.ETHEREUM.name) {
      return `https://etherscan.io/address/${address}`;
    } else if (network === NETWORKS.BASE.name) {
      return `https://basescan.org/address/${address}`;
    }
    return `https://etherscan.io/address/${address}`;
  }

  function getActivityLinkFromId(id: string | undefined): string {
    if (!id) return '#';
    // On prend le hash de la transaction (66 caractères) sans les zéros à la fin
    const hash = id.slice(0, 66).replace(/0+$/, '');
    return getExplorerBaseUrl() + hash;
  }

  function getActivityType(type: string): string {
    return type?.replace('Request', '') || 'Unknown';
  }

  function getActivityAmount(activity: any): string {
    if (!activity.amount) return '0';
    return activity.amount.toString();
  }

  function isActivitySettled(activity: Activity): boolean {
    if (!activity.createdAt) return false;
    
    // Pour les dépôts, on cherche un événement settleDeposit
    if (activity.type === 'depositRequest') {
      return activities.some(a => 
        a.type === 'settleDeposit' && 
        new Date(a.createdAt) > new Date(activity.createdAt)
      );
    }
    
    // Pour les retraits, on cherche un événement settleRedeem
    if (activity.type === 'redeemRequest') {
      return activities.some(a => 
        a.type === 'settleRedeem' && 
        new Date(a.createdAt) > new Date(activity.createdAt)
      );
    }
    
    return false;
  }

  function getNetAssetsForHash(hash: string): { sharesMinted: number; sharesBurned: number; netShares: number } {
    const eventsForHash = activities.filter(a => a.id && a.id.startsWith(hash));
    const hasSettlement = eventsForHash.some(e => e.type === 'settleDeposit' || e.type === 'settleRedeem');
    
    if (!hasSettlement) {
      return { sharesMinted: 0, sharesBurned: 0, netShares: 0 };
    }

    const sharesMinted = eventsForHash
      .filter(e => e.type === 'settleDeposit')
      .reduce((sum, e) => sum + (e.sharesMinted ? parseFloat(e.sharesMinted.toString()) / Math.pow(10, 18) : 0), 0);

    const sharesBurned = eventsForHash
      .filter(e => e.type === 'settleRedeem')
      .reduce((sum, e) => sum + (e.sharesBurned ? parseFloat(e.sharesBurned.toString()) / Math.pow(10, 18) : 0), 0);

    return {
      sharesMinted,
      sharesBurned,
      netShares: sharesMinted - sharesBurned
    };
  }

  function getUniqueTransactionHashes(): string[] {
    const hashes = new Set<string>();
    activities.forEach(activity => {
      if (activity.id) {
        const hash = activity.id.slice(0, 66);
        hashes.add(hash);
      }
    });
    return Array.from(hashes);
  }

  onMount(() => {
    fetchInitialActivities();
  });

  $: if (activeTab) {
    fetchInitialActivities();
  }
</script>

<div class="chart-box" in:fade={{ duration: 200 }}>
  <div class="header">
    <h4 class="title-label">
      Activities
    </h4>
  </div>
  <div class="info-box">
    <nav class="tabs-navigation">
      {#each tabs as tab}
        <button 
          class="tab-button" 
          class:active={activeTab === tab}
          on:click={() => { activeTab = tab; }}
        >
          {tab}
        </button>
      {/each}
    </nav>
    <div class="info-content" on:scroll={handleScroll}>
      {#if loading && initialLoad}
        <div class="loading">
          <div class="spinner"></div>
        </div>
      {:else if error && showError && !loading}
        <div class="error" transition:fade>{error}</div>
      {:else if activities.length === 0}
        <p>No activities found</p>
      {:else}
        <div class="documents-list" bind:this={documentsList}>
          {#if isSettlementTab(activeTab)}
            <div class="column-headers">
              <div class="header-cell from">From</div>
              <div class="header-cell amount">Net Assets</div>
              <div class="header-cell time">Time</div>
            </div>
            {#each getUniqueTransactionHashes() as hash}
              {@const events = activities.filter(a => a.id && a.id.startsWith(hash))}
              {@const hasSettlement = events.some(e => e.type === 'settleDeposit' || e.type === 'settleRedeem')}
              {@const netAssets = getNetAssetsForHash(hash)}
              {#if hasSettlement || events.some(e => e.type === 'totalAssetsUpdated')}
                <div class="document-item">
                  <div class="document-header">
                    <div class="activity-row">
                      <div class="activity-cell from">
                        <a href={getAddressExplorerUrl(currentVault?.administrator)} class="hash-link" target="_blank" rel="noopener noreferrer">
                          {formatAddress(currentVault?.administrator)}
                          <svg class="external-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </a>
                      </div>
                      <div class="activity-cell amount">
                        <span class="cell-value">
                          {#if netAssets.netShares > 0}
                            +{netAssets.netShares.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currentVault?.ticker}
                          {:else if netAssets.netShares < 0}
                            {netAssets.netShares.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currentVault?.ticker}
                          {:else}
                            0 {currentVault?.ticker}
                          {/if}
                        </span>
                      </div>
                      <div class="activity-cell time">
                        {#if events[0]?.id}
                          <a href={getActivityLinkFromId(events[0].id)} class="hash-link" target="_blank" rel="noopener noreferrer">
                            {getTimeAgo(events[0].createdAt)}
                            <svg class="external-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                              <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                              <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </a>
                        {:else}
                          <span class="cell-value">N/A</span>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/if}
            {/each}
          {:else}
            <div class="column-headers">
              <div class="header-cell from">From</div>
              <div class="header-cell amount">
                {#if isSettlementTab(activeTab)}
                  Net Assets
                {:else}
                  Amount
                {/if}
              </div>
              {#if !isValuationOrSettlementTab(activeTab)}
                <div class="header-cell status">Status</div>
              {/if}
              {#if !isValuationOrSettlementTab(activeTab)}
                <div class="header-cell time">Time</div>
              {:else}
                <div class="header-cell time">Time</div>
              {/if}
            </div>
            {#each activities.filter(a => a.createdAt && !a.type.includes('settle')) as activity}
              <div class="document-item">
                <div class="document-header">
                  <div class="activity-row">
                    <div class="activity-cell from">
                      {#if activeTab === 'Valuation'}
                        <a href={getAddressExplorerUrl(currentVault?.priceOracle)} class="hash-link" target="_blank" rel="noopener noreferrer">
                          {formatAddress(currentVault?.priceOracle)}
                          <svg class="external-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </a>
                      {:else}
                        <a href={getAddressExplorerUrl(activity.owner)} class="hash-link" target="_blank" rel="noopener noreferrer">
                          {formatAddress(activity.owner)}
                          <svg class="external-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </a>
                      {/if}
                    </div>
                    <div class="activity-cell amount">
                      <span class="cell-value">
                        {#if activeTab === 'Withdraw'}
                          {formatAmountByToken(activity.shares, currentVault?.underlyingToken)} {currentVault?.ticker}
                        {:else if activeTab === 'Valuation'}
                          {formatAmountByToken(activity.totalAssets, currentVault?.underlyingToken)} {currentVault?.underlyingToken}
                        {:else}
                          {formatAmountByToken(activity.assets, currentVault?.underlyingToken)} {currentVault?.underlyingToken}
                        {/if}
                      </span>
                    </div>
                    {#if !isValuationOrSettlementTab(activeTab)}
                      <div class="activity-cell status">
                        <span class="cell-value">{isActivitySettled(activity) ? 'Settled' : 'Pending'}</span>
                      </div>
                    {/if}
                    {#if !isValuationOrSettlementTab(activeTab)}
                      <div class="activity-cell time">
                        {#if activity.id}
                          <a href={getActivityLinkFromId(activity.id)} class="hash-link" target="_blank" rel="noopener noreferrer">
                            {getTimeAgo(activity.createdAt)}
                            <svg class="external-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                              <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                              <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </a>
                        {:else}
                          <span class="cell-value">N/A</span>
                        {/if}
                      </div>
                    {:else}
                      <div class="activity-cell time">
                        {#if activity.id}
                          <a href={getActivityLinkFromId(activity.id)} class="hash-link" target="_blank" rel="noopener noreferrer">
                            {getTimeAgo(activity.createdAt)}
                            <svg class="external-link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                              <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                              <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </a>
                        {:else}
                          <span class="cell-value">N/A</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
          {#if loading && !initialLoad}
            <div class="loading-more">
              <div class="spinner small"></div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .chart-box {
    width: 100%;
    background: rgba(10, 34, 58, 0.503);
    border-radius: 0.75rem;
    box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 0;
    position: relative;
    height: calc(4.3 * (75px + 3rem + 0.5rem) + 4.5rem); /* Augmenté pour 4 cartes sur desktop */
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    padding: 1.5rem 2rem 0;
  }

  .title-label {
    color: rgba(255, 255, 255, 0.5);
    font-size: 1rem;
    font-weight: 500;
    margin: 0;
    letter-spacing: 0.02em;
  }

  .info-box {
    width: 100%;
    background: transparent;
    border-radius: 0.75rem;
    box-shadow: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    height: 100%;
    overflow: hidden;
  }

  .tabs-navigation {
    display: flex;
    gap: 0.5rem;
    margin: 0;
    padding: 1rem 2rem;
    width: 100%;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: transparent;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .tab-button {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.95rem;
    font-weight: 500;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.5rem;
    flex: 1;
    text-align: center;
    white-space: nowrap;
  }

  .tab-button:hover {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.05);
  }

  .tab-button.active {
    color: #4DA8FF;
    background: rgba(77, 168, 255, 0.1);
  }

  .info-content {
    color: #94a3b8;
    flex: 1 1 0%;
    overflow-y: auto;
    padding: 1.5rem 2rem;
    width: 100%;
  }

  .info-content::-webkit-scrollbar {
    width: 6px;
  }

  .info-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
  }

  .info-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .info-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .documents-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .column-headers {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 500;
  }

  .column-headers .header-cell {
    justify-self: center;
  }
  .column-headers .header-cell:first-child {
    justify-self: start;
    text-align: left;
  }
  .column-headers .header-cell:last-child {
    justify-self: end;
    text-align: right;
  }

  /* Pour 3 colonnes dynamiquement */
  .column-headers:has(.header-cell:nth-child(3):last-child) {
    grid-template-columns: repeat(3, 1fr);
  }

  .header-cell {
    padding: 0.5rem 0;
  }

  .document-item {
    background: rgba(10, 34, 58, 0.503);
    border-radius: 0.75rem;
    box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 1rem;
    min-height: 60px;
    transition: all 0.2s ease;
  }

  .document-item:first-child {
    border-top-left-radius: 0.75rem;
    border-top-right-radius: 0.75rem;
  }

  .document-item:last-child {
    border-bottom-left-radius: 0.75rem;
    border-bottom-right-radius: 0.75rem;
  }

  .activity-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    align-items: center;
    width: 100%;
  }

  .activity-row .activity-cell {
    justify-self: center;
  }
  .activity-row .activity-cell:first-child {
    justify-self: start;
    text-align: left;
  }
  .activity-row .activity-cell:last-child {
    justify-self: end;
    text-align: right;
  }

  /* Pour 3 colonnes dynamiquement */
  .activity-row:has(.activity-cell:nth-child(3):last-child) {
    grid-template-columns: repeat(3, 1fr);
  }

  .activity-cell {
    display: flex;
    align-items: center;
  }

  .cell-value {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }

  .hash-link {
    color: rgba(255, 255, 255, 0.8);
    text-decoration: none;
    font-weight: 500;
    font-size: 1rem;
    font-family: inherit;
    transition: opacity 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
  }

  .hash-link:hover {
    opacity: 0.7;
  }

  .external-link-icon {
    width: 1em;
    height: 1em;
    opacity: 0.8;
    margin-left: 0.2em;
    color: inherit;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .error {
    color: #ef4444;
    text-align: center;
    padding: 1rem;
  }

  .loading-more {
    text-align: center;
    padding: 0.5rem;
    color: #64748b;
    font-size: 0.875rem;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    border-top-color: #4DA8FF;
    animation: spin 1s ease-in-out infinite;
  }

  .spinner.small {
    width: 20px;
    height: 20px;
    border-width: 2px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .chart-box {
      padding-top: 1.5rem;
      height: calc(3.8 * (75px + 3rem + 0.5rem) + 4.5rem); /* Ajusté pour 2 cartes sur mobile */
      min-height: auto;
    }

    .tabs-navigation {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      padding: 1rem;
    }

    .tab-button {
      padding: 0.5rem;
      font-size: 0.9rem;
    }

    .info-content {
      padding: 1rem;
      height: calc(100% - 80px);
      overflow-y: auto;
    }

    .documents-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .document-item {
      padding: 1rem;
      min-height: auto;
      margin-bottom: 0;
    }

    .activity-row {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }

    .activity-cell {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .activity-cell:last-child {
      border-bottom: none;
    }

    .activity-cell::before {
      content: attr(data-label);
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .cell-value {
      font-size: 0.9rem;
    }

    /* Supprimer les styles des boutons de défilement */
    .scroll-button {
      display: none;
    }

    .column-headers {
      display: none;
    }
  }

  @media (max-width: 480px) {
    .chart-box {
      padding-top: 1rem;
    }
  }
</style> 