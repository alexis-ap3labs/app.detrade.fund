<script lang="ts">
  import { ALL_VAULTS } from '$lib/vaults';
  import { prices } from '$lib/stores/prices';
  import { onDestroy, onMount } from 'svelte';
  import { thirtyDayApr } from '$lib/stores/30d_apr';
  import { browser } from '$app/environment';
  import { getBalance, readContract, getPublicClient, writeContract, watchContractEvent } from '@wagmi/core';
  import { config } from '$lib/rabbykit';
  import { wallet } from '$lib/stores/wallet';
  import { formatUnits, zeroAddress } from 'viem';
  import { rabbykit } from '$lib/rabbykit';
  import { erc20Abi } from 'viem';
  import { pps } from '$lib/stores/pps';
  import vaultAbi from '$lib/abi/vault.json';
  import ReviewModalDeposit from './ReviewModalDeposit.svelte';
  import ReviewModalWithdraw from './ReviewModalWithdraw.svelte';
  import { transactions } from '$lib/stores/transactions';
  import { ASSETS } from '$lib/vaults';
  import { createPublicClient, http } from 'viem';
  import { base } from 'viem/chains';

  export let vaultId: string;

  // Trouver le vault correspondant
  $: vault = ALL_VAULTS.find(v => v.id === vaultId);
  $: underlyingToken = vault?.underlyingToken ?? '';
  $: underlyingTokenIcon = vault?.underlyingTokenIcon ?? '';
  $: maxDecimals = vault?.underlyingTokenDecimals ?? 6;

  // Pour l'exemple, hardcode l'adresse USDC selon le réseau (ici Base)
  const USDC_ADDRESS_BASE = '0xd9AAEC86B65d86F6A7B5B1b0c42FFA531710b6CA';
  $: underlyingTokenAddress = (vault && 'underlyingTokenAddress' in vault && (vault as any).underlyingTokenAddress) ? (vault as any).underlyingTokenAddress : '';

  let isInputFocused = false;
  let depositAmount = '';
  let usdValue: string = '$0';
  let underlyingPrice: number | null = null;
  let apr = '';
  let mounted = false;
  let userBalance = '0';
  let isBalanceLoading = true;
  let insufficientBalance = false;
  let vaultTokenBalance = '0';
  let isVaultBalanceLoading = true;
  let vaultUserShares = '0';
  let isVaultSharesLoading = true;
  let latestPps = '1';
  let isPpsLoading = true;
  let claimableDepositShares: number | null = null;
  let claimableDepositAssets: number | null = null;
  let isClaimableDepositLoading = false;
  let hasPendingDeposit = false;
  let pendingAmount = '0';
  let currentAllowance = '0';
  let isAllowanceLoading = false;
  let needsApprove = false;

  // Ajout d'une variable pour stocker les requestIds en pending
  let pendingRequestIds: string[] = [];

  // Ajout des variables pour les pending redeems
  let hasPendingRedeem = false;
  let pendingRedeemAmount = '0';
  let pendingRedeemRequestIds: string[] = [];
  let lastRedeemRequestId: string | null = null;
  let isLastRedeemRequestIdLoading = false;

  // Ajout des états pour les redeems claimables
  let hasClaimableRedeem = false;
  let claimableRedeemAmount = '0';
  let claimableRedeemRequestId: string | null = null;
  let isClaimableRedeemLoading = false;

  // Ajouter la variable pour stocker les assets claimables
  let claimableRedeemAssets: number | null = null;

  let unsubscribe: () => void;
  let unwatchDeposit: () => void;
  let unwatchRedeem: () => void;
  let checkLogsInterval: NodeJS.Timeout;

  // Définir le type pour activeTab
  let activeTab: 'deposit' | 'withdraw' = 'deposit';
  let previousTab: 'deposit' | 'withdraw' = 'deposit';

  let showReviewModal = false;

  $: if (activeTab !== previousTab) {
    depositAmount = '';
    updateUsdValue();
    previousTab = activeTab;
  }

  $: showEthIcon = vaultId === 'detrade-core-eth';

  // Cache pour les requêtes RPC
  const rpcCache = {
    balanceOf: new Map<string, { value: string; timestamp: number }>(),
    userBalance: new Map<string, { value: string; timestamp: number }>(),
    vaultBalance: new Map<string, { value: string; timestamp: number }>()
  };

  // Durée de validité du cache en millisecondes (30 secondes)
  const CACHE_DURATION = 30000;

  // Fonction pour gérer le debounce
  let debounceTimers = {
    userBalance: null as NodeJS.Timeout | null,
    vaultBalance: null as NodeJS.Timeout | null,
    vaultShares: null as NodeJS.Timeout | null
  };

  function debounce(key: keyof typeof debounceTimers, fn: () => void, delay = 1000) {
    if (debounceTimers[key]) {
      clearTimeout(debounceTimers[key]!);
    }
    debounceTimers[key] = setTimeout(fn, delay);
  }

  // Fonction pour vérifier si une valeur en cache est valide
  function isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < CACHE_DURATION;
  }

  // Fonction pour obtenir une clé de cache
  function getCacheKey(...args: string[]): string {
    return args.join('_');
  }

  // Fonction pour récupérer le solde de l'utilisateur
  async function fetchUserBalance() {
    console.log('[fetchUserBalance] called', { address: $wallet.address, underlyingTokenAddress });
    if (!$wallet.address) {
      userBalance = '0';
      isBalanceLoading = false;
      console.log('[fetchUserBalance] missing address, set userBalance=0');
      return;
    }

    const cacheKey = getCacheKey($wallet.address, underlyingTokenAddress);
    const cached = rpcCache.userBalance.get(cacheKey);
    
    if (cached && isCacheValid(cached.timestamp)) {
      userBalance = cached.value;
      isBalanceLoading = false;
      console.log('[fetchUserBalance] using cached value:', userBalance);
      return;
    }

    try {
      isBalanceLoading = true;

      // Gestion spéciale pour le vault ETH natif uniquement
      if (vaultId === 'detrade-core-eth') {
        const balance = await getBalance(config, {
          address: $wallet.address as `0x${string}`
        });
        userBalance = formatUnits(balance.value, balance.decimals);
        rpcCache.userBalance.set(cacheKey, { value: userBalance, timestamp: Date.now() });
        console.log('[fetchUserBalance] ETH native balance fetched:', { value: balance.value, decimals: balance.decimals, userBalance });
        return;
      }

      // Pour les autres tokens
      if (!underlyingTokenAddress) {
        userBalance = '0';
        isBalanceLoading = false;
        console.log('[fetchUserBalance] missing token address, set userBalance=0');
        return;
      }

      const balance = await getBalance(config, {
        address: $wallet.address as `0x${string}`,
        token: underlyingTokenAddress as `0x${string}`
      });
      userBalance = formatUnits(balance.value, balance.decimals);
      rpcCache.userBalance.set(cacheKey, { value: userBalance, timestamp: Date.now() });
      console.log('[fetchUserBalance] token balance fetched:', { value: balance.value, decimals: balance.decimals, userBalance });
    } catch (error) {
      console.error('[fetchUserBalance] Error:', error);
      userBalance = '0';
    } finally {
      isBalanceLoading = false;
    }
  }

  // Fonction pour récupérer la balance du vault contract
  async function fetchVaultTokenBalance() {
    console.log('[fetchVaultTokenBalance] called', { vaultContract: vault?.vaultContract, underlyingTokenAddress });
    if (!vault?.vaultContract || !underlyingTokenAddress) {
      vaultTokenBalance = '0';
      isVaultBalanceLoading = false;
      console.log('[fetchVaultTokenBalance] missing vaultContract or token, set vaultTokenBalance=0');
      return;
    }

    const cacheKey = getCacheKey(vault.vaultContract, underlyingTokenAddress);
    const cached = rpcCache.vaultBalance.get(cacheKey);
    
    if (cached && isCacheValid(cached.timestamp)) {
      vaultTokenBalance = cached.value;
      isVaultBalanceLoading = false;
      console.log('[fetchVaultTokenBalance] using cached value:', vaultTokenBalance);
      return;
    }

    try {
      isVaultBalanceLoading = true;
      const balance = await getBalance(config, {
        address: vault.vaultContract as `0x${string}`,
        token: underlyingTokenAddress as `0x${string}`
      });
      vaultTokenBalance = formatUnits(balance.value, balance.decimals);
      rpcCache.vaultBalance.set(cacheKey, { value: vaultTokenBalance, timestamp: Date.now() });
      console.log('[fetchVaultTokenBalance] fetched', { value: balance.value, decimals: balance.decimals, vaultTokenBalance });
    } catch (error) {
      console.error('[fetchVaultTokenBalance] Error:', error);
      vaultTokenBalance = '0';
    } finally {
      isVaultBalanceLoading = false;
    }
  }

  // Fonction pour récupérer les parts de l'utilisateur dans le vault
  async function fetchVaultUserShares() {
    console.log('[fetchVaultUserShares] called', { vaultContract: vault?.vaultContract, user: $wallet.address });
    if (!vault?.vaultContract || !$wallet.address) {
      vaultUserShares = '0';
      isVaultSharesLoading = false;
      console.log('[fetchVaultUserShares] missing vaultContract or user, set vaultUserShares=0');
      return;
    }

    const cacheKey = getCacheKey(vault.vaultContract, $wallet.address);
    const cached = rpcCache.balanceOf.get(cacheKey);
    
    if (cached && isCacheValid(cached.timestamp)) {
      vaultUserShares = cached.value;
      isVaultSharesLoading = false;
      console.log('[fetchVaultUserShares] using cached value:', vaultUserShares);
      return;
    }

    try {
      isVaultSharesLoading = true;
      const shares = await readContract(config, {
        address: vault.vaultContract as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [$wallet.address as `0x${string}`]
      });
      vaultUserShares = shares.toString();
      rpcCache.balanceOf.set(cacheKey, { value: vaultUserShares, timestamp: Date.now() });
      console.log('[fetchVaultUserShares] fetched', { 
        rawShares: shares,
        vaultUserShares,
        claimableDepositShares,
        total: (BigInt(vaultUserShares) + BigInt(claimableDepositShares || '0')).toString()
      });
    } catch (e) {
      console.error('[fetchVaultUserShares] Error:', e);
      vaultUserShares = '0';
    } finally {
      isVaultSharesLoading = false;
    }
  }

  // Fonction pour rafraîchir le dernier PPS
  async function fetchLatestPps() {
    if (!vaultId) return;
    isPpsLoading = true;
    const latestPpsData = await pps.getLatestPps(vaultId);
    latestPps = latestPpsData?.ppsFormatted?.toString() || '1';
    isPpsLoading = false;
    console.log('[fetchLatestPps] latestPps:', latestPps);
  }

  // Fonction pour récupérer le dernier lastDepositRequestId de l'utilisateur
  let lastDepositRequestId: string | null = null;
  let isLastDepositRequestIdLoading = false;

  async function fetchLastDepositRequestId() {
    console.log('[fetchLastDepositRequestId] called', { vaultContract: vault?.vaultContract, user: $wallet.address });
    if (!vault?.vaultContract || !$wallet.address) {
      lastDepositRequestId = null;
      isLastDepositRequestIdLoading = false;
      console.log('[fetchLastDepositRequestId] missing vaultContract or user, set lastDepositRequestId=null');
      return;
    }
    try {
      isLastDepositRequestIdLoading = true;
      // D'abord, appeler l'API pour obtenir le dernier requestId
      const response = await fetch(`/api/vaults/${vaultId}/operations/last_request?userAddress=${$wallet.address}`);
      const data = await response.json();
      
      if (data.lastDepositRequestId) {
        lastDepositRequestId = data.lastDepositRequestId;
        console.log('[fetchLastDepositRequestId] Found last deposit requestId:', lastDepositRequestId);
        
        // Maintenant que nous avons le requestId, on peut vérifier s'il est claimable ou en attente (en parallèle)
        await Promise.all([
          fetchClaimableDepositRequest(),
          checkPendingDeposit()
        ]);
      } else {
        console.log('[fetchLastDepositRequestId] No deposits found for user');
        lastDepositRequestId = null;
      }
    } catch (e) {
      console.error('[fetchLastDepositRequestId] Error:', e);
      lastDepositRequestId = null;
    } finally {
      isLastDepositRequestIdLoading = false;
    }
  }

  // Fonction pour récupérer le dernier redeemRequestId de l'utilisateur
  async function fetchLastRedeemRequestId() {
    console.log('[fetchLastRedeemRequestId] called', { vaultContract: vault?.vaultContract, user: $wallet.address });
    if (!vault?.vaultContract || !$wallet.address) {
      lastRedeemRequestId = null;
      isLastRedeemRequestIdLoading = false;
      console.log('[fetchLastRedeemRequestId] missing vaultContract or user, set lastRedeemRequestId=null');
      return;
    }
    try {
      isLastRedeemRequestIdLoading = true;
      const response = await fetch(`/api/vaults/${vaultId}/operations/last_request?userAddress=${$wallet.address}`);
      const data = await response.json();
      
      if (data.lastRedeemRequestId) {
        lastRedeemRequestId = data.lastRedeemRequestId;
        console.log('[fetchLastRedeemRequestId] Found last redeem requestId:', lastRedeemRequestId);
        
        // Si on a un requestId, on vérifie s'il est claimable ou en attente (en parallèle)
        await Promise.all([
          fetchClaimableRedeemRequest(),
          checkPendingRedeem()
        ]);
      } else {
        console.log('[fetchLastRedeemRequestId] No redeems found for user');
        lastRedeemRequestId = null;
      }
    } catch (e) {
      console.error('[fetchLastRedeemRequestId] Error:', e);
      lastRedeemRequestId = null;
    } finally {
      isLastRedeemRequestIdLoading = false;
    }
  }

  // Mettre à jour le solde quand l'adresse du wallet ou le token change
  $: if ($wallet.address && underlyingTokenAddress) {
    console.log('[REACTIVE] fetchUserBalance trigger', { address: $wallet.address, underlyingTokenAddress });
    debounce('userBalance', fetchUserBalance);
  }

  // Mettre à jour la balance du vault contract quand le vault ou le token change
  $: if ($wallet.address && vault?.vaultContract && underlyingTokenAddress) {
    console.log('[REACTIVE] fetchVaultTokenBalance trigger', { address: $wallet.address, vaultContract: vault?.vaultContract, underlyingTokenAddress });
    debounce('vaultBalance', fetchVaultTokenBalance);
  }

  // Mettre à jour la balance des parts utilisateur quand le wallet ou le vault change
  $: if ($wallet.address && vault?.vaultContract) {
    console.log('[REACTIVE] fetchVaultUserShares trigger', { address: $wallet.address, vaultContract: vault?.vaultContract });
    isVaultSharesLoading = true;
    debounce('vaultShares', fetchVaultUserShares);
  }

  // Rafraîchir le PPS quand le vaultId change
  $: if (vaultId) {
    isPpsLoading = true;
    fetchLatestPps();
  }

  // Calculer la valeur totale de la position utilisateur en USDC
  $: userPositionUsd = (Number(vaultUserShares) * Number(latestPps)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function updateUsdValue() {
    if (!underlyingPrice || !depositAmount) {
      usdValue = '$0';
      return;
    }

    try {
      if (activeTab === 'withdraw') {
        // Pour le withdraw, on utilise la valeur en parts
        const parts = Number(depositAmount);
        const underlyingValue = parts * Number(latestPps) * underlyingPrice;
        usdValue = '$' + underlyingValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
      } else {
        // Pour le deposit, on utilise directement la valeur en underlying
        const amount = parseFloat(depositAmount.replace(',', '.'));
        if (isNaN(amount)) {
          usdValue = '$0';
          return;
        }
        // Pour l'ETH, on utilise directement le montant car il est déjà en ETH
        if (vaultId === 'detrade-core-eth') {
          usdValue = '$' + (amount * underlyingPrice).toLocaleString(undefined, { maximumFractionDigits: 2 });
        } else {
          usdValue = '$' + (amount * underlyingPrice).toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
      }
    } catch (error) {
      console.error('[updateUsdValue] Error:', error);
      usdValue = '$0';
    }
  }

  // Souscription au store pour mettre à jour underlyingPrice
  $: if (vault?.coingeckoId) {
    if (unsubscribe) unsubscribe();
    unsubscribe = prices.subscribe(state => {
      console.log('[VaultSidePanel] PRICES STATE:', state); // Log plus détaillé
      if (vaultId === 'detrade-core-eth') {
        // Pour le vault ETH, on utilise le prix du WETH
        if (state['WETH']) {
          underlyingPrice = state['WETH'].price;
          console.log('[VaultSidePanel] WETH price updated:', underlyingPrice);
        } else {
          console.warn('[VaultSidePanel] WETH price not found in store, trying to fetch it');
          prices.getPrice('WETH').catch(error => {
            console.error('[VaultSidePanel] Error fetching WETH price:', error);
          });
          underlyingPrice = 0;
        }
      } else if (vault?.underlyingToken && state[vault.underlyingToken]) {
        underlyingPrice = state[vault.underlyingToken].price;
        console.log('[VaultSidePanel] Price updated for', vault.underlyingToken, ':', underlyingPrice);
      } else {
        console.warn('[VaultSidePanel] Price not found for', vault?.underlyingToken, 'in store prices.');
        underlyingPrice = 0;
      }
    });
  }

  // Appel automatique de la conversion à chaque changement de prix ou d'input
  $: {
    if (depositAmount || underlyingPrice) {
      console.log('[VaultSidePanel] Updating USD value:', { depositAmount, underlyingPrice });
      updateUsdValue();
    }
  }

  // Fonction pour récupérer l'APR
  async function fetchApr() {
    if (!vaultId) return;
    try {
      thirtyDayApr.setLoading(vaultId, true);
      const response = await fetch(`/api/vaults/${vaultId}/metrics/30d_apr`);
      const data = await response.json();
      if (data.apr !== undefined) {
        thirtyDayApr.setApr(vaultId, {
          apr: data.apr,
          timestamp: new Date().toISOString()
        });
        apr = data.apr.toFixed(2);
      }
    } catch (error) {
      console.error('Error fetching APR:', error);
      thirtyDayApr.setError(vaultId, 'Failed to fetch APR data');
    }
  }

  // Only fetch APR data when vaultId changes, but only on the client side
  $: if (browser && vaultId) {
    fetchApr();
  }

  function handleInput(event: Event) {
    let value = (event.target as HTMLInputElement).value;

    // Autoriser uniquement chiffres et un seul séparateur décimal (point ou virgule)
    value = value.replace(/[^0-9.,]/g, '');

    // Remplacer toutes les virgules par des points
    value = value.replace(/,/g, '.');

    // Ne garder qu'un seul point (le premier)
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    // Limiter le nombre de décimales selon le mode (deposit ou withdraw)
    if (value.includes('.')) {
      const [intPart, decPart] = value.split('.');
      const decimals = activeTab === 'withdraw' ? 18 : (vault?.underlyingTokenDecimals || 6);
      value = intPart + '.' + decPart.slice(0, decimals);
    }

    depositAmount = value;
    updateUsdValue();
  }

  function handleKeyDown(event: KeyboardEvent) {
    const allowed =
      // chiffres
      (event.key >= '0' && event.key <= '9') ||
      // point ou virgule
      event.key === '.' || event.key === ',' ||
      // touches de contrôle
      event.key === 'Backspace' ||
      event.key === 'Delete' ||
      event.key === 'Tab' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'Home' ||
      event.key === 'End';

    if (!allowed) {
      event.preventDefault();
    }
  }

  // Valeur de l'input en USDC
  $: inputUsd = depositAmount && underlyingPrice ? Number(depositAmount) * underlyingPrice : 0;
  // Valeur totale après dépôt
  $: totalPositionUsd = Number(userPositionUsd.replace(/[^0-9.]/g, "")) + inputUsd;
  // APR value (corrige le bug)
  $: aprValue = parseFloat(apr) || 0;
  // Projected earnings sur la base totale
  $: earningsBase = totalPositionUsd > 0 ? totalPositionUsd : 0;
  $: earningsYear = earningsBase * (aprValue / 100);
  $: earningsMonth = earningsYear / 12;
  $: earningsYearUsd = earningsYear;
  $: earningsMonthUsd = earningsMonth;

  // Fonction pour formater les valeurs en K si >= 10000 (uniquement pour l'affichage)
  function formatValue(value: string | number): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (numValue >= 10000) {
      return (Math.round(numValue / 100) / 10).toFixed(1) + 'K';
    }
    if (vaultId === 'detrade-core-eth' && numValue < 1) {
      return numValue.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    return numValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Fonction pour tronquer à 2 décimales (uniquement pour l'affichage)
  function truncateTo2Decimals(value: number): number {
    return Math.round(value * 1e6) / 1e6;
  }

  // Fonction pour convertir de wei en nombre (pour l'affichage)
  function fromWei(value: string | bigint | number | null): string {
    if (value === null) return '0';
    const bigValue = BigInt(value);
    const divisor = BigInt(1e18);
    const result = bigValue / divisor;
    const remainder = bigValue % divisor;
    return `${result}.${remainder.toString().padStart(18, '0')}`;
  }

  function parseWei(value: string): bigint {
    if (!value) return BigInt(0);
    const [whole, fraction = '0'] = value.split('.');
    const paddedFraction = fraction.padEnd(18, '0').slice(0, 18);
    return BigInt(whole + paddedFraction);
  }

  // Calcul du total de parts (claim + non claim) - garder les valeurs en wei
  $: totalVaultShares = (BigInt(vaultUserShares || '0') + BigInt(claimableDepositShares || '0')).toString();
  // Valeurs formatées pour l'affichage
  $: formattedVaultUserShares = fromWei(vaultUserShares);
  $: formattedClaimableDepositShares = fromWei(claimableDepositShares);
  $: formattedTotalVaultShares = fromWei(totalVaultShares);
  $: totalVaultSharesUsd = Number(formattedTotalVaultShares) * Number(latestPps);
  // Calcul de la valeur totale en underlying token (parts + pending + claimable)
  $: totalUnderlyingValue = (Number(formattedTotalVaultShares) * Number(latestPps)) + 
    (hasPendingDeposit ? Number(pendingAmount) : 0) + 
    (claimableDepositAssets ? Number(claimableDepositAssets) / Math.pow(10, vault?.underlyingTokenDecimals || 6) : 0) +
    (claimableRedeemAssets ? Number(claimableRedeemAssets) / Math.pow(10, vault?.underlyingTokenDecimals || 6) : 0);

  // Valeur maximale withdrawable (parts wallet + claimable) - garder les valeurs en wei
  $: maxWithdrawShares = totalVaultShares;
  $: formattedMaxWithdrawShares = fromWei(maxWithdrawShares);
  $: displayMaxWithdrawShares = formatTo6Decimals(formattedMaxWithdrawShares);

  let maxWithdrawWei = '0';

  function setMaxWithdraw() {
    // On garde la valeur en wei pour la transaction
    const maxDecimal = fromWei(maxWithdrawShares);
    // Afficher la valeur complète (toutes les décimales) dans l'input
    depositAmount = maxDecimal;
    // On stocke la valeur en wei pour la transaction
    maxWithdrawWei = maxWithdrawShares;
    updateUsdValue();
  }

  // Ajout pour corriger le calcul des earnings futurs lors d'un retrait MAX
  $: isMaxWithdraw = activeTab === 'withdraw' && depositAmount === displayMaxWithdrawShares;
  $: trueWithdrawAmount = isMaxWithdraw ? Number(formattedMaxWithdrawShares) : Number(depositAmount);

  // Valeur actuelle (en underlying, parts * PPS) - garder la précision maximale
  $: sharesToWithdraw = activeTab === 'withdraw' ? trueWithdrawAmount : 0;
  $: inputUnderlying = activeTab === 'deposit' ? Number(depositAmount) : 0;
  $: currentUnderlying = Number(formattedTotalVaultShares) * Number(latestPps);
  $: pendingUnderlying = hasPendingDeposit ? Number(pendingAmount) : 0;
  $: sharesValueInUnderlying = sharesToWithdraw * Number(latestPps);
  $: totalUnderlying = activeTab === 'withdraw'
    ? Math.max(currentUnderlying - sharesValueInUnderlying, 0) + pendingUnderlying
    : currentUnderlying + inputUnderlying + pendingUnderlying;

  // Forcer la mise à jour des valeurs quand le prix change
  $: if (underlyingPrice) {
    console.log('[PRICE UPDATE] Recalculating values:', {
      currentUnderlying,
      pendingUnderlying,
      totalUnderlying,
      underlyingPrice
    });
    // Forcer la réactivité en réassignant les valeurs
    currentUnderlying = Number(formattedTotalVaultShares) * Number(latestPps);
    pendingUnderlying = hasPendingDeposit ? Number(pendingAmount) : 0;
    totalUnderlying = activeTab === 'withdraw'
      ? Math.max(currentUnderlying - sharesValueInUnderlying, 0) + pendingUnderlying
      : currentUnderlying + inputUnderlying + pendingUnderlying;
  }

  // Earnings actuels et futurs (après dépôt ou retrait)
  $: currentEarningsYear = currentUnderlying * (aprValue / 100);
  $: currentEarningsMonth = currentEarningsYear / 12;
  $: futureEarningsYear = totalUnderlying * (aprValue / 100);
  $: futureEarningsMonth = futureEarningsYear / 12;
  // Forcer les earnings futurs à 0 si on retire tout (MAX)
  $: if (isMaxWithdraw) {
    futureEarningsYear = 0;
    futureEarningsMonth = 0;
  }

  // Fonction pour remplir le champ avec le solde max
  function setMax() {
    depositAmount = userBalance;
    updateUsdValue();
  }

  // Fonction pour ouvrir le module de connexion
  function openWalletModal() {
    rabbykit.open();
  }

  $: console.log('[RENDER] Your position', { isVaultBalanceLoading, vaultTokenBalance, depositAmount });

  $: insufficientBalance = Boolean($wallet.address && depositAmount && Number(depositAmount) > Number(userBalance));
  $: console.log('[RENDER] insufficientBalance', { insufficientBalance, depositAmount, userBalance });

  async function fetchClaimableDepositRequest() {
    if (!vault?.vaultContract || !$wallet.address || lastDepositRequestId === null) {
      claimableDepositShares = null;
      claimableDepositAssets = null;
      isClaimableDepositLoading = false;
      console.log('[fetchClaimableDepositRequest] missing vaultContract, user, or lastDepositRequestId');
      return;
    }
    try {
      isClaimableDepositLoading = true;
      console.log('[fetchClaimableDepositRequest] called', {
        vaultContract: vault.vaultContract,
        requestId: lastDepositRequestId,
        controller: $wallet.address
      });

      // Récupérer le montant claimable en assets
      const claimableAssets = await readContract(config, {
        address: vault.vaultContract as `0x${string}`,
        abi: vaultAbi,
        functionName: 'claimableDepositRequest',
        args: [lastDepositRequestId, $wallet.address as `0x${string}`]
      });

      console.log('[fetchClaimableDepositRequest] claimableAssets:', claimableAssets);

      if (Number(claimableAssets) > 0) {
        // Convertir les assets en parts
        const shares = await readContract(config, {
          address: vault.vaultContract as `0x${string}`,
          abi: vaultAbi,
          functionName: 'convertToShares',
          args: [claimableAssets]
        });

        // Stocker les deux valeurs
        claimableDepositAssets = Number(claimableAssets);
        claimableDepositShares = Number(shares);
        
        console.log('[fetchClaimableDepositRequest] Claimable found:', {
          rawAssets: claimableAssets,
          assets: claimableDepositAssets,
          shares: claimableDepositShares,
          total: (BigInt(vaultUserShares || '0') + BigInt(claimableDepositShares)).toString()
        });
      } else {
        console.log('[fetchClaimableDepositRequest] No claimable assets found');
        claimableDepositShares = null;
        claimableDepositAssets = null;
      }
    } catch (e) {
      console.error('[fetchClaimableDepositRequest] Error:', e);
      claimableDepositShares = null;
      claimableDepositAssets = null;
    } finally {
      isClaimableDepositLoading = false;
    }
  }

  // Appeler la fonction quand lastDepositRequestId change
  $: if (lastDepositRequestId !== null && $wallet.address && vault?.vaultContract) {
    console.log('[DEBUG][$:] lastDepositRequestId changed, calling fetchClaimableDepositRequest et checkPendingDeposit', {
      lastDepositRequestId,
      address: $wallet.address,
      vaultContract: vault?.vaultContract
    });
    fetchClaimableDepositRequest();
    checkPendingDeposit();
  }

  // Vérification d'un dépôt en cours
  async function checkPendingDeposit() {
    console.log('[DEBUG][checkPendingDeposit] called', {
      vaultContract: vault?.vaultContract,
      user: $wallet.address,
      lastDepositRequestId
    });
    if (!vault?.vaultContract || !$wallet.address || lastDepositRequestId === null) {
      console.log('[DEBUG][checkPendingDeposit] missing vaultContract, user, or lastDepositRequestId', {
        vaultContract: vault?.vaultContract,
        user: $wallet.address,
        lastDepositRequestId
      });
      return;
    }

    try {
      console.log('[DEBUG][checkPendingDeposit] Checking pending deposit for:', {
        vaultContract: vault.vaultContract,
        requestId: lastDepositRequestId,
        user: $wallet.address
      });

      // Récupérer le montant en attente directement depuis le contrat
      const pendingAmountResult = await readContract(config, {
        address: vault.vaultContract as `0x${string}`,
        abi: vaultAbi,
        functionName: 'pendingDepositRequest',
        args: [lastDepositRequestId, $wallet.address as `0x${string}`]
      });

      console.log('[DEBUG][checkPendingDeposit] Raw pendingAmountResult:', pendingAmountResult);

      const decimals = vault.underlyingTokenDecimals || 6;
      const amount = Number(pendingAmountResult) / Math.pow(10, decimals);
      
      console.log('[DEBUG][checkPendingDeposit] Processed amount:', {
        raw: pendingAmountResult,
        decimals,
        amount
      });
      
      if (amount > 0) {
        console.log('[DEBUG][checkPendingDeposit] Dépôt en attente trouvé:', {
          requestId: lastDepositRequestId,
          amount,
          decimals,
          raw: pendingAmountResult
        });
        
        hasPendingDeposit = true;
        pendingAmount = amount.toString();
        pendingRequestIds = [`#${lastDepositRequestId}`];
      } else {
        console.log('[DEBUG][checkPendingDeposit] Aucun montant en attente trouvé pour:', {
          requestId: lastDepositRequestId,
          raw: pendingAmountResult,
          amount
        });
        hasPendingDeposit = false;
        pendingAmount = '0';
        pendingRequestIds = [];
      }
      console.log('[DEBUG][checkPendingDeposit] FINAL STATE:', {
        hasPendingDeposit,
        pendingAmount,
        pendingRequestIds
      });
    } catch (e) {
      console.error('[DEBUG][checkPendingDeposit] Error:', e);
      hasPendingDeposit = false;
      pendingAmount = '0';
      pendingRequestIds = [];
    }
  }

  // Fonction pour vérifier si un redeem est claimable
  async function fetchClaimableRedeemRequest() {
    if (!vault?.vaultContract || !$wallet.address || lastRedeemRequestId === null) {
      claimableRedeemAmount = '0';
      hasClaimableRedeem = false;
      isClaimableRedeemLoading = false;
      console.log('[fetchClaimableRedeemRequest] missing vaultContract, user, or lastRedeemRequestId');
      return;
    }

    try {
      isClaimableRedeemLoading = true;
      console.log('[fetchClaimableRedeemRequest] called', {
        vaultContract: vault.vaultContract,
        requestId: lastRedeemRequestId,
        user: $wallet.address
      });

      // Récupérer le montant claimable en underlying token
      const claimableAmount = await readContract(config, {
        address: vault.vaultContract as `0x${string}`,
        abi: vaultAbi,
        functionName: 'claimableRedeemRequest',
        args: [lastRedeemRequestId, $wallet.address as `0x${string}`]
      });

      console.log('[fetchClaimableRedeemRequest] claimableAmount:', claimableAmount);

      if (Number(claimableAmount) > 0) {
        hasClaimableRedeem = true;
        claimableRedeemAmount = claimableAmount.toString();
        claimableRedeemRequestId = lastRedeemRequestId;
        
        // Convertir les parts en assets avec les valeurs exactes
        const claimableAssets = await readContract(config, {
          address: vault.vaultContract as `0x${string}`,
          abi: vaultAbi,
          functionName: 'convertToAssets',
          args: [claimableAmount]
        });

        console.log('[fetchClaimableRedeemRequest] Converted to assets:', {
          shares: claimableAmount,
          requestId: lastRedeemRequestId,
          assets: claimableAssets
        });
        
        // Stocker la valeur en assets pour l'affichage
        claimableRedeemAssets = Number(claimableAssets);
        
        console.log('[fetchClaimableRedeemRequest] Redeem claimable found:', {
          requestId: lastRedeemRequestId,
          shares: claimableAmount,
          assets: claimableAssets,
          underlyingToken
        });
      } else {
        console.log('[fetchClaimableRedeemRequest] No claimable redeem found');
        hasClaimableRedeem = false;
        claimableRedeemAmount = '0';
        claimableRedeemRequestId = null;
        claimableRedeemAssets = null;
      }
    } catch (e) {
      console.error('[fetchClaimableRedeemRequest] Error:', e);
      hasClaimableRedeem = false;
      claimableRedeemAmount = '0';
      claimableRedeemRequestId = null;
      claimableRedeemAssets = null;
    } finally {
      isClaimableRedeemLoading = false;
    }
  }

  // Fonction pour gérer le claim d'un redeem
  async function handleClaim() {
    if (!vault?.vaultContract || !$wallet.address || !claimableRedeemRequestId) {
      console.error('[handleClaim] Missing required data');
      return;
    }

    try {
      console.log('[handleClaim] Starting claim process:', {
        vaultContract: vault.vaultContract,
        requestId: claimableRedeemRequestId,
        amount: claimableRedeemAmount,
        user: $wallet.address
      });

      // Envoyer la transaction de claim
      const hash = await writeContract(config, {
        address: vault.vaultContract as `0x${string}`,
        abi: vaultAbi,
        functionName: 'redeem',
        args: [
          BigInt(claimableRedeemAmount),
          $wallet.address as `0x${string}`,
          $wallet.address as `0x${string}`
        ]
      });

      console.log('[handleClaim] Transaction sent:', hash);

      // Mettre à jour l'état de la transaction
      transactions.setPending(hash);

      // Attendre la confirmation sur la blockchain
      const publicClient = getPublicClient(config);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1
      });

      console.log('[handleClaim] Transaction confirmed:', receipt);

      // Mettre à jour l'état de la transaction
      transactions.setComplete();

      // Réinitialiser les états
      hasClaimableRedeem = false;
      claimableRedeemAmount = '0';
      claimableRedeemRequestId = null;

    } catch (error) {
      console.error('[handleClaim] Error:', error);
      transactions.reset();
    }
  }

  // Modifier la fonction checkPendingRedeem pour inclure la vérification des redeems claimables
  async function checkPendingRedeem() {
    if (!vault?.vaultContract || !$wallet.address || lastRedeemRequestId === null) {
      console.log('[checkPendingRedeem] missing vaultContract, user, or lastRedeemRequestId');
      return;
    }

    try {
      // Vérifier d'abord si le redeem est claimable
      await fetchClaimableRedeemRequest();

      // Si le redeem n'est pas claimable, vérifier s'il est en attente
      if (!hasClaimableRedeem) {
        const pendingAmountResult = await readContract(config, {
          address: vault.vaultContract as `0x${string}`,
          abi: vaultAbi,
          functionName: 'pendingRedeemRequest',
          args: [lastRedeemRequestId, $wallet.address as `0x${string}`]
        });

        const amount = Number(pendingAmountResult) / 1e18;
        
        if (amount > 0) {
          console.log('[checkPendingRedeem] Pending redeem found:', {
            requestId: lastRedeemRequestId,
            amount,
          });
          
          hasPendingRedeem = true;
          pendingRedeemAmount = amount.toString();
          pendingRedeemRequestIds = [`#${lastRedeemRequestId}`];
        } else {
          console.log('[checkPendingRedeem] No pending redeem found');
          hasPendingRedeem = false;
          pendingRedeemAmount = '0';
          pendingRedeemRequestIds = [];
        }
      }
    } catch (e) {
      console.error('[checkPendingRedeem] Error:', e);
      hasPendingRedeem = false;
      pendingRedeemAmount = '0';
      pendingRedeemRequestIds = [];
    }
  }

  // Mettre à jour l'intervalle pour inclure la vérification des redeems claimables
  $: if ($wallet.address && vault?.vaultContract) {
    // Suppression de l'intervalle
  }

  // Nettoyer l'intervalle quand le composant est détruit
  onDestroy(() => {
    if (unsubscribe) unsubscribe();
    if (unwatchDeposit) unwatchDeposit();
    if (unwatchRedeem) unwatchRedeem();
    if (checkLogsInterval) clearInterval(checkLogsInterval);
    // Nettoyer les timers de debounce
    Object.values(debounceTimers).forEach(timer => {
      if (timer) clearTimeout(timer);
    });
  });

  function handleDepositClick() {
    showReviewModal = true;
  }

  function handleCloseReview() {
    showReviewModal = false;
  }

  async function handleConfirmReview(event: CustomEvent) {
    const { func, params, value } = event.detail;
    console.log('[handleConfirmReview] Transaction received:', { func, params, value });
    if (!vault?.vaultContract) {
      console.error('[handleConfirmReview] No vault contract found');
      return;
    }
    try {
      if (activeTab === 'withdraw' && depositAmount) {
        if (isMaxWithdraw) {
          params[0] = BigInt(maxWithdrawShares);
        } else {
          params[0] = parseWei(depositAmount);
        }
      }
      // Utilise value si présent (ETH natif), sinon n'ajoute pas le champ value
      const writeArgs = {
        address: vault.vaultContract as `0x${string}`,
        abi: vaultAbi,
        functionName: func,
        args: params,
        ...(value !== undefined ? { value } : {})
      };
      const hash = await writeContract(config, writeArgs);
      transactions.setPending(hash);
      const publicClient = getPublicClient(config);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      transactions.setComplete();
      showReviewModal = false;

      // Mettre à jour immédiatement l'état des pending/claimables
      if (activeTab === 'withdraw') {
        hasPendingRedeem = true;
        pendingRedeemAmount = depositAmount;
        // Récupérer le dernier requestId
        const response = await fetch(`/api/vaults/${vaultId}/operations/last_request?userAddress=${$wallet.address}`);
        const data = await response.json();
        if (data.lastRedeemRequestId) {
          lastRedeemRequestId = data.lastRedeemRequestId;
          pendingRedeemRequestIds = [`#${lastRedeemRequestId}`];
        }
      }

      // Démarrer l'intervalle de vérification après une action réussie
      if (checkLogsInterval) {
        clearInterval(checkLogsInterval);
      }
      checkLogsInterval = setInterval(async () => {
        console.log('[checkLogsInterval] Checking for new requests...');
        if (activeTab === 'deposit') {
          await fetchLastDepositRequestId();
          await checkPendingDeposit();
          await fetchClaimableDepositRequest();
        } else {
          await fetchLastRedeemRequestId();
          await checkPendingRedeem();
          await fetchClaimableRedeemRequest();
        }
      }, 30000); // 30 secondes

      // Affichage optimiste de la carte pending deposit
      if (activeTab === 'deposit') {
        hasPendingDeposit = true;
        pendingAmount = depositAmount;
        pendingRequestIds = ['pending'];
      }

    } catch (error) {
      console.error('[handleConfirmReview] Transaction failed:', error);
      // Ajoute cette ligne pour afficher l'erreur dans l'UI
      wallet.setError(error?.message || 'Transaction failed');
      transactions.reset();
    }
  }

  // Nettoyer l'intervalle quand le composant est détruit ou quand on change d'onglet
  $: if (activeTab !== previousTab) {
    if (checkLogsInterval) {
      clearInterval(checkLogsInterval);
    }
    previousTab = activeTab;
  }

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
    if (unwatchDeposit) unwatchDeposit();
    if (unwatchRedeem) unwatchRedeem();
    if (checkLogsInterval) clearInterval(checkLogsInterval);
    // Nettoyer les timers de debounce
    Object.values(debounceTimers).forEach(timer => {
      if (timer) clearTimeout(timer);
    });
  });

  $: withdrawUnderlying = activeTab === 'withdraw' ? sharesToWithdraw * Number(latestPps) : 0;

  $: showSimulation = (activeTab === 'deposit' && inputUnderlying > 0) || (activeTab === 'withdraw' && withdrawUnderlying > 0);

  // Réinitialiser toutes les valeurs calculées dépendant du wallet à la déconnexion
  $: if (!$wallet.address) {
    // Réinitialisation des balances et des parts
    userBalance = '0';
    vaultTokenBalance = '0';
    vaultUserShares = '0';
    latestPps = '1';
    claimableDepositShares = null;
    
    // Réinitialisation des états de pending
    hasPendingDeposit = false;
    hasPendingRedeem = false;
    pendingAmount = '0';
    pendingRedeemAmount = '0';
    pendingRequestIds = [];
    pendingRedeemRequestIds = [];
    lastDepositRequestId = null;
    lastRedeemRequestId = null;
    
    // Réinitialisation des valeurs calculées
    currentUnderlying = 0;
    pendingUnderlying = 0;
    totalUnderlying = 0;
    totalUnderlyingValue = 0;
    totalVaultShares = '0';
    totalVaultSharesUsd = 0;
    maxWithdrawShares = '0';
    
    // Réinitialisation des valeurs monétaires
    usdValue = '$0';
    inputUsd = 0;
    totalPositionUsd = 0;
    userPositionUsd = '0.00';
    
    // Réinitialisation des valeurs de retrait/dépôt
    sharesToWithdraw = 0;
    inputUnderlying = 0;
    withdrawUnderlying = 0;
    
    // Réinitialisation des earnings
    earningsBase = 0;
    earningsYear = 0;
    earningsMonth = 0;
    earningsYearUsd = 0;
    earningsMonthUsd = 0;
    currentEarningsYear = 0;
    currentEarningsMonth = 0;
    futureEarningsYear = 0;
    futureEarningsMonth = 0;
    
    // Réinitialisation de l'onglet actif
    activeTab = 'deposit';
    previousTab = 'deposit';
    
    // Réinitialisation des états de chargement
    isBalanceLoading = false;
    isVaultBalanceLoading = false;
    isVaultSharesLoading = false;
    isPpsLoading = false;
    isClaimableDepositLoading = false;
    isLastDepositRequestIdLoading = false;
    isLastRedeemRequestIdLoading = false;

    // Réinitialisation des états de claim
    hasClaimableRedeem = false;
    claimableRedeemAmount = '0';
    claimableRedeemRequestId = null;
    isClaimableRedeemLoading = false;
  }

  // Mise à jour des calculs pour les projections
  $: if (!$wallet.address) {
    withdrawBeforeUnderlying = 0;
    withdrawAfterUnderlying = 0;
    totalUnderlying = 0;
    currentUnderlying = 0;
    pendingUnderlying = 0;
    currentEarningsYear = 0;
    currentEarningsMonth = 0;
    futureEarningsYear = 0;
    futureEarningsMonth = 0;
  } else {
    currentEarningsYear = currentUnderlying * (aprValue / 100);
    currentEarningsMonth = currentEarningsYear / 12;
    futureEarningsYear = totalUnderlying * (aprValue / 100);
    futureEarningsMonth = futureEarningsYear / 12;
  }

  // Fonction pour vérifier si le montant est valide
  $: isAmountValid = depositAmount && Number(depositAmount) > 0 && 
    (activeTab === 'deposit' ? (!insufficientBalance && !needsApprove) : BigInt(parseWei(depositAmount)) <= BigInt(maxWithdrawShares));

  // Mise à jour des calculs pour les projections
  $: withdrawBeforeUnderlying = Number(formattedTotalVaultShares) * Number(latestPps);
  $: withdrawAfterUnderlying = (Number(formattedTotalVaultShares) - Number(depositAmount)) * Number(latestPps);

  function formatUSDC(value: number) {
    if (vaultId === 'detrade-core-eth' && value < 1) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatUSDCompact(value: number) {
    if (value >= 10000) {
      return '$' + (value / 1000).toFixed(1) + 'K';
    }
    if (vaultId === 'detrade-core-eth' && value < 1) {
      return '$' + value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    return '$' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function format6Decimals(value: number) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  }

  function formatTo6Decimals(value: string): string {
    const [whole, fraction = '0'] = value.split('.');
    return `${whole}.${fraction.slice(0, 6)}`;
  }

  $: maxWithdrawUsdValue = (
    Number(depositAmount || 0) * Number(latestPps) * (underlyingPrice || 0)
  ).toLocaleString(undefined, { maximumFractionDigits: 2 });

  $: ethIcon = ASSETS.icons.eth;
  $: wethIcon = ASSETS.icons.weth;

  // Observer les événements du contrat quand le wallet est connecté
  $: if ($wallet.address && vault?.vaultContract) {
    // Observer les événements de deposit
    unwatchDeposit = watchContractEvent(config, {
      address: vault.vaultContract as `0x${string}`,
      abi: vaultAbi,
      eventName: 'DepositRequest',
      args: {
        controller: $wallet.address as `0x${string}`
      },
      onLogs: (logs) => {
        console.log('New deposit request:', logs);
        // Mettre à jour l'état local avec les nouvelles données
        fetchLastDepositRequestId();
        checkPendingDeposit();
        fetchClaimableDepositRequest();
      }
    });

    // Observer les événements de redeem
    unwatchRedeem = watchContractEvent(config, {
      address: vault.vaultContract as `0x${string}`,
      abi: vaultAbi,
      eventName: 'RedeemRequest',
      args: {
        controller: $wallet.address as `0x${string}`
      },
      onLogs: (logs) => {
        console.log('New redeem request:', logs);
        // Mettre à jour l'état local avec les nouvelles données
        fetchLastRedeemRequestId();
        checkPendingRedeem();
        fetchClaimableRedeemRequest();
      }
    });
  }

  // Nettoyer les observateurs quand le composant est détruit
  onDestroy(() => {
    if (unsubscribe) unsubscribe();
    if (unwatchDeposit) unwatchDeposit();
    if (unwatchRedeem) unwatchRedeem();
  });

  // Nettoyer les observateurs quand le wallet se déconnecte
  $: if (!$wallet.address) {
    if (unwatchDeposit) unwatchDeposit();
    if (unwatchRedeem) unwatchRedeem();
  }

  let pollingInterval: NodeJS.Timeout | null = null;

  onMount(() => {
    mounted = true;
    // Charger les données publiques immédiatement
    fetchLatestPps();
    fetchVaultTokenBalance();

    // Charger les données liées au wallet seulement si un wallet est connecté
    if ($wallet.address) {
      fetchUserBalance();
      fetchVaultUserShares();
      fetchLastDepositRequestId();
      fetchLastRedeemRequestId();
    }

    // Polling propre toutes les 10 secondes
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
      if ($wallet.address) {
        console.log('[POLLING] fetchLastDepositRequestId & fetchLastRedeemRequestId', new Date().toISOString());
        fetchLastDepositRequestId();
        fetchLastRedeemRequestId();
      }
    }, 10000);

    // Configurer les watchers d'événements
    if (vault?.vaultContract) {
      unwatchDeposit = watchContractEvent(config, {
        address: vault.vaultContract as `0x${string}`,
        abi: vaultAbi,
        eventName: 'DepositRequested',
        onLogs: (logs) => {
          console.log('[VaultSidePanel] DepositRequested event:', logs);
          if ($wallet.address) {
            fetchLastDepositRequestId();
          }
        }
      });

      unwatchRedeem = watchContractEvent(config, {
        address: vault.vaultContract as `0x${string}`,
        abi: vaultAbi,
        eventName: 'RedeemRequested',
        onLogs: (logs) => {
          console.log('[VaultSidePanel] RedeemRequested event:', logs);
          if ($wallet.address) {
            fetchLastRedeemRequestId();
          }
        }
      });
    }

    // Initialiser le prix du token sous-jacent
    if (vaultId === 'detrade-core-eth') {
      console.log('[VaultSidePanel] Initializing WETH price');
      prices.getPrice('WETH').catch(error => {
        console.error('[VaultSidePanel] Error initializing WETH price:', error);
      });
    } else if (underlyingToken) {
      console.log('[VaultSidePanel] Initializing price for', underlyingToken);
      prices.getPrice(underlyingToken).catch(error => {
        console.error('[VaultSidePanel] Error initializing price for', underlyingToken, ':', error);
      });
    }
  });

  onDestroy(() => {
    if (unwatchDeposit) unwatchDeposit();
    if (unwatchRedeem) unwatchRedeem();
    if (checkLogsInterval) clearInterval(checkLogsInterval);
    if (pollingInterval) clearInterval(pollingInterval);
  });

  // Mettre à jour les données quand le wallet change
  $: if (mounted && $wallet.address) {
    fetchUserBalance();
    fetchVaultUserShares();
    fetchLastDepositRequestId();
    fetchLastRedeemRequestId();
  }

  $: if ($wallet.address) {
    // Réinitialise les états liés aux pending/claimables
    hasPendingDeposit = false;
    pendingAmount = '0';
    pendingRequestIds = [];
    lastDepositRequestId = null;
    claimableDepositShares = null;
    claimableDepositAssets = null;

    // Relance la récupération des pending/claimables pour le nouveau wallet
    fetchLastDepositRequestId();
    fetchLastRedeemRequestId();
  }

  // Valeur totale de la position utilisateur en underlying token (wallet + claimable + pending redeem) * PPS + pending deposit
  $: totalPositionUnderlying = (
    Number(formattedVaultUserShares)
    + (claimableDepositShares ? Number(formattedClaimableDepositShares) : 0)
    + (hasPendingRedeem ? Number(pendingRedeemAmount) : 0)
  ) * Number(latestPps)
    + (hasPendingDeposit ? Number(pendingAmount) : 0);

  // Valeur totale des parts (wallet + claimable + pending redeem)
  $: totalParts = (
    Number(formattedVaultUserShares)
    + (claimableDepositShares ? Number(formattedClaimableDepositShares) : 0)
    + (hasPendingRedeem ? Number(pendingRedeemAmount) : 0)
  );
  // Valeur en underlying des parts
  $: totalPartsUnderlying = totalParts * Number(latestPps);
  // Earnings projetés sur la base des parts uniquement
  $: currentEarningsYear = totalPartsUnderlying * (aprValue / 100);
  $: currentEarningsMonth = currentEarningsYear / 12;

  // Fonction pour vérifier l'allowance
  async function checkAllowance() {
    if (!vault?.vaultContract || !$wallet.address || !underlyingTokenAddress || vaultId === 'detrade-core-eth') {
      currentAllowance = '0';
      isAllowanceLoading = false;
      needsApprove = false;
      return;
    }

    try {
      isAllowanceLoading = true;
      const allowance = await readContract(config, {
        address: underlyingTokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [$wallet.address as `0x${string}`, vault.vaultContract as `0x${string}`]
      });

      currentAllowance = formatUnits(allowance, vault.underlyingTokenDecimals);
      console.log('[checkAllowance] Current allowance:', currentAllowance);

      // Vérifier si l'allowance est suffisante pour le montant à déposer + 1 USDC de marge
      const requiredAllowance = Number(depositAmount) + 1;
      needsApprove = Number(currentAllowance) < requiredAllowance;
      console.log('[checkAllowance] Needs approve:', needsApprove, 'Required:', requiredAllowance);
    } catch (error) {
      console.error('[checkAllowance] Error:', error);
      currentAllowance = '0';
      needsApprove = true;
    } finally {
      isAllowanceLoading = false;
    }
  }

  // Fonction pour faire l'approve
  async function handleApprove() {
    if (!vault?.vaultContract || !$wallet.address || !underlyingTokenAddress || vaultId === 'detrade-core-eth') {
      return;
    }

    try {
      // Calculer le montant à approuver (montant à déposer + 1 USDC de marge)
      const amountToApprove = (Number(depositAmount) + 1) * Math.pow(10, vault.underlyingTokenDecimals);
      
      const hash = await writeContract(config, {
        address: underlyingTokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [vault.vaultContract as `0x${string}`, BigInt(amountToApprove)]
      });

      transactions.setPending(hash);
      const publicClient = getPublicClient(config);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      transactions.setComplete();

      // Recheck allowance after approve
      await checkAllowance();
    } catch (error) {
      console.error('[handleApprove] Error:', error);
      transactions.reset();
    }
  }

  // Mettre à jour l'allowance quand le montant change
  $: if ($wallet.address && depositAmount && underlyingTokenAddress && vault?.vaultContract && vaultId !== 'detrade-core-eth') {
    debounce('allowance', checkAllowance);
  }

  $: disabled = activeTab === 'deposit'
    ? (insufficientBalance || isAllowanceLoading)
    : Number(depositAmount) > Number(formattedMaxWithdrawShares);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(import.meta.env.PUBLIC_BASE_RPC)
  });
</script>

<div class="side-panel">
  {#if $wallet.address}
    <div class="vault-tabs">
      <button class="vault-tab {activeTab === 'deposit' ? 'active' : ''}" on:click={() => activeTab = 'deposit'}>Deposit</button>
      <button class="vault-tab {activeTab === 'withdraw' ? 'active' : ''}" on:click={() => activeTab = 'withdraw'}>Withdraw</button>
    </div>
  {/if}
  <div class="panel-box" class:no-animation={isInputFocused}>
    <div class="panel-title">
      <span>{activeTab === 'withdraw' ? 'Withdraw' : 'Deposit'} {showEthIcon ? 'ETH' : underlyingToken}</span>
      {#if showEthIcon}
        <img src={ethIcon} alt="ETH" class="token-icon" />
      {:else if underlyingTokenIcon}
        <img src={underlyingTokenIcon} alt={underlyingToken} class="token-icon" />
      {/if}
    </div>
    <input
      type="text"
      class="panel-amount {depositAmount ? 'has-value' : ''} position-input"
      placeholder="0.00"
      bind:value={depositAmount}
      on:input={handleInput}
      on:keydown={handleKeyDown}
      on:focus={() => isInputFocused = true}
      on:blur={() => isInputFocused = false}
      inputmode="decimal"
      pattern="[0-9]*[.,]?[0-9]*"
      max={activeTab === 'withdraw' ? formattedMaxWithdrawShares : undefined}
    />
    <div class="usd-balance-row">
      <div class="usd-value-inline">
        {#if activeTab === 'withdraw'}
          ${ (Number(depositAmount || 0) * Number(latestPps) * (underlyingPrice || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 }) }
        {:else}
          {usdValue}
        {/if}
      </div>
      {#if $wallet.address}
        <div class="balance-max-inline {isBalanceLoading ? 'balance-blur' : ''}">
          {#if activeTab === 'withdraw'}
            <span class="balance">{displayMaxWithdrawShares} {vault?.ticker}</span>
            <button class="max-btn" type="button" on:click={setMaxWithdraw}>MAX</button>
          {:else}
            <span class="balance">{Number(userBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {showEthIcon ? 'ETH' : underlyingToken}</span>
            <button class="max-btn" type="button" on:click={setMax}>MAX</button>
          {/if}
        </div>
      {/if}
    </div>
    {#if $wallet.address && depositAmount && Number(depositAmount) > 0}
      <button
        class="connect-wallet {activeTab === 'withdraw' ? 'withdraw' : ''} {disabled ? 'disabled' : ''}"
        disabled={activeTab === 'deposit'
          ? (insufficientBalance || isAllowanceLoading)
          : Number(depositAmount) > Number(formattedMaxWithdrawShares)}
        on:click={activeTab === 'deposit' && needsApprove ? handleApprove : handleDepositClick}
        style="margin-top: 1rem; margin-bottom: 0.5rem;"
      >
        {#if activeTab === 'deposit' && insufficientBalance}
          Insufficient {underlyingToken} Balance
        {:else if activeTab === 'withdraw' && Number(depositAmount) > Number(formattedMaxWithdrawShares)}
          Insufficient {vault?.ticker} Balance
        {:else if activeTab === 'deposit' && needsApprove}
          Approve {underlyingToken}
        {:else}
          {activeTab === 'deposit' ? 'Deposit' : 'Withdraw'}
        {/if}
      </button>
    {/if}
  </div>
  {#if activeTab === 'deposit'}
    <div class="panel-box">
      <div class="panel-title">
        <span>Your position ({underlyingToken})</span>
        {#if underlyingTokenIcon}
          <img src={underlyingTokenIcon} alt={underlyingToken} class="token-icon" />
        {/if}
      </div>
      <div class="position-row">
        <span class="inline-amount position-tooltip-container {($wallet.address && (isVaultSharesLoading || isPpsLoading)) ? 'balance-blur' : ''}">
          {#if $wallet.address}
            {#if !depositAmount || Number(depositAmount) === 0}
              <span class="inline-amount">{formatUSDC(totalPositionUnderlying)} {underlyingToken}</span>
            {:else}
              <span class="inline-amount initial-value">{formatUSDC(totalPositionUnderlying)} {underlyingToken}</span>
            {/if}
          {:else}
            {#if !depositAmount || Number(depositAmount) === 0}
              <span class="inline-amount">0.00 {underlyingToken}</span>
            {:else}
              <span class="inline-amount initial-value">0.00 {underlyingToken}</span>
            {/if}
          {/if}
          {#if $wallet.address}
            <span class="position-tooltip">
              {#if isVaultSharesLoading}
                Loading shares…
              {:else}
                <div class="tooltip-content">
                  <div class="tooltip-line">Wallet: {formatUSDC(Number(formattedVaultUserShares))} {vault?.ticker}</div>
                  {#if claimableDepositShares}
                    <div class="tooltip-line">Claimable: {formatUSDC(Number(formattedClaimableDepositShares))} {vault?.ticker}</div>
                  {/if}
                  {#if hasPendingDeposit && Number(pendingAmount) > 0}
                    <div class="tooltip-line">Pending deposit: {formatUSDC(Number(pendingAmount))} {underlyingToken}</div>
                  {/if}
                  {#if hasPendingRedeem && Number(pendingRedeemAmount) > 0}
                    <div class="tooltip-line">Pending redeem: {formatUSDC(Number(pendingRedeemAmount))} {vault?.ticker}</div>
                  {/if}
                  <div class="tooltip-separator"></div>
                  <div class="tooltip-total">
                    Total: {formatUSDC(
                      (
                        Number(formattedVaultUserShares)
                        + (claimableDepositShares ? Number(formattedClaimableDepositShares) : 0)
                        + (hasPendingRedeem ? Number(pendingRedeemAmount) : 0)
                      ) * Number(latestPps)
                      + (hasPendingDeposit ? Number(pendingAmount) : 0)
                    )} {underlyingToken}
                  </div>
                </div>
              {/if}
            </span>
          {/if}
          {#if !((activeTab === 'deposit' && inputUnderlying > 0) || (activeTab === 'withdraw' && withdrawUnderlying > 0)) && (currentUnderlying + pendingUnderlying) > 0}
            <span class="usd-value">${formatUSDC((currentUnderlying + pendingUnderlying) * (underlyingPrice || 0))}</span>
          {/if}
        </span>
        {#if (activeTab === 'deposit' && inputUnderlying > 0) || (activeTab === 'withdraw' && withdrawUnderlying > 0)}
          <span class="arrow">→</span>
          <span class="inline-amount has-value">
            {formatValue(totalUnderlying)} {underlyingToken}
            <span class="usd-value">{formatUSDCompact(totalUnderlying * (underlyingPrice || 0))}</span>
          </span>
        {/if}
      </div>
      <div class="panel-label">30D APR</div>
      <div class="panel-apy panel-apy-large">{apr ? Number(apr).toFixed(2) + '%' : '--'}</div>
      <div class="panel-label">Projected Earnings / Month</div>
      <div class="earnings-row">
        <span class="inline-amount position-tooltip-container {showSimulation ? 'initial-value' : ''}">
          {currentEarningsMonth > 0
            ? `${formatUSDC(currentEarningsMonth)} ${underlyingToken}`
            : `0.00 ${underlyingToken}`}
          <span class="position-tooltip tooltip-explain">
            Projected earnings are calculated as:<br/>
            <b>(Wallet parts + Claimable deposit parts + Pending redeem parts) × PPS × APR</b><br/>
            Pending deposits and claimable redeems are not included until they are converted to parts.
          </span>
          {#if !showSimulation}
            <span class="usd-value">{formatUSDCompact(currentEarningsMonth * (underlyingPrice || 0))}</span>
          {/if}
        </span>
        {#if showSimulation}
          <span class="arrow">→</span>
          <span class="inline-amount has-value">
            {formatValue(futureEarningsMonth)} {underlyingToken}
            <span class="usd-value">{formatUSDCompact(futureEarningsMonth * (underlyingPrice || 0))}</span>
          </span>
        {/if}
      </div>
      <div class="panel-label">Projected Earnings / Year</div>
      <div class="earnings-row">
        <span class="inline-amount position-tooltip-container {showSimulation ? 'initial-value' : ''}">
          {currentEarningsYear > 0
            ? `${formatUSDC(currentEarningsYear)} ${underlyingToken}`
            : `0.00 ${underlyingToken}`}
          <span class="position-tooltip tooltip-explain">
            Projected earnings are calculated as:<br/>
            <b>(Wallet parts + Claimable deposit parts + Pending redeem parts) × PPS × APR</b><br/>
            Pending deposits and claimable redeems are not included until they are converted to parts.
          </span>
          {#if !showSimulation}
            <span class="usd-value">{formatUSDCompact(currentEarningsYear * (underlyingPrice || 0))}</span>
          {/if}
        </span>
        {#if showSimulation}
          <span class="arrow">→</span>
          <span class="inline-amount has-value">
            {formatValue(futureEarningsYear)} {underlyingToken}
            <span class="usd-value">{formatUSDCompact(futureEarningsYear * (underlyingPrice || 0))}</span>
          </span>
        {/if}
      </div>
    </div>

    {#if hasClaimableRedeem && Number(claimableRedeemAmount) > 0}
      <div class="pending-box claimable-box">
        <div class="pending-header">
          <span class="pending-dot claimable-dot"></span>
          <span class="pending-title">Claimable redeem</span>
          {#if claimableRedeemRequestId}
            <span class="pending-badge">#{claimableRedeemRequestId}</span>
          {/if}
        </div>
        <div class="pending-row">
          <div class="pending-amount-group">
            <span class="pending-amount">
              {#if underlyingToken === 'WETH'}
                {formatUSDC((claimableRedeemAssets ?? 0) / 1e18)} {underlyingToken}
              {:else}
                {formatUSDC((claimableRedeemAssets ?? 0) / Math.pow(10, vault?.underlyingTokenDecimals || 6))} {underlyingToken}
              {/if}
            </span>
            <span class="pending-usd-value">
              {#if underlyingToken === 'WETH'}
                {formatUSDCompact(((claimableRedeemAssets ?? 0) / 1e18) * (underlyingPrice || 0))}
              {:else}
                {formatUSDCompact(((claimableRedeemAssets ?? 0) / Math.pow(10, vault?.underlyingTokenDecimals || 6)) * (underlyingPrice || 0))}
              {/if}
            </span>
          </div>
          <button class="claim-btn" on:click={handleClaim}>Claim</button>
        </div>
      </div>
    {/if}

    {#if hasPendingDeposit && Number(pendingAmount) > 0}
      <div class="pending-box">
        <div class="pending-header">
          <span class="pending-dot"></span>
          <span class="pending-title">Pending deposit{pendingRequestIds.length > 1 ? 's' : ''}</span>
          {#each pendingRequestIds as reqId}
            <span class="pending-badge">{reqId}</span>
          {/each}
        </div>
        <div class="pending-row">
          <span class="pending-amount">{formatValue(truncateTo2Decimals(Number(pendingAmount)))} {underlyingToken}</span>
        </div>
      </div>
    {/if}
  {:else if activeTab === 'withdraw'}
    <div class="panel-box">
      <div class="panel-title">
        <span>Your position ({underlyingToken})</span>
        {#if underlyingTokenIcon}
          <img src={underlyingTokenIcon} alt={underlyingToken} class="token-icon" />
        {/if}
      </div>
      <div class="position-row">
        <span class="inline-amount position-tooltip-container {($wallet.address && (isVaultSharesLoading || isPpsLoading)) ? 'balance-blur' : ''}">
          {#if $wallet.address}
            {#if !depositAmount || Number(depositAmount) === 0}
              <span class="inline-amount">{formatUSDC(currentUnderlying + pendingUnderlying)} {underlyingToken}</span>
            {:else}
              <span class="inline-amount initial-value">{formatUSDC(currentUnderlying + pendingUnderlying)} {underlyingToken}</span>
            {/if}
          {:else}
            {#if !depositAmount || Number(depositAmount) === 0}
              <span class="inline-amount">0.00 {underlyingToken}</span>
            {:else}
              <span class="inline-amount initial-value">0.00 {underlyingToken}</span>
            {/if}
          {/if}
          {#if $wallet.address}
            <span class="position-tooltip">
              {#if isVaultSharesLoading}
                Loading shares…
              {:else}
                <div class="tooltip-content">
                  <div class="tooltip-line">Wallet: {formatUSDC(Number(formattedVaultUserShares))} {vault?.ticker}</div>
                  {#if claimableDepositShares}
                    <div class="tooltip-line">Claimable: {formatUSDC(Number(formattedClaimableDepositShares))} {vault?.ticker}</div>
                  {/if}
                  {#if hasPendingDeposit && Number(pendingAmount) > 0}
                    <div class="tooltip-line">Pending deposit: {formatUSDC(Number(pendingAmount))} {underlyingToken}</div>
                  {/if}
                  {#if hasPendingRedeem && Number(pendingRedeemAmount) > 0}
                    <div class="tooltip-line">Pending redeem: {formatUSDC(Number(pendingRedeemAmount))} {vault?.ticker}</div>
                  {/if}
                  <div class="tooltip-separator"></div>
                  <div class="tooltip-total">
                    Total: {formatUSDC(
                      (Number(formattedTotalVaultShares) * Number(latestPps)) + 
                      (hasPendingDeposit ? Number(pendingAmount) : 0)
                    )} {underlyingToken}
                  </div>
                  <div class="tooltip-total">
                    Total parts: {Number(formattedTotalVaultShares).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {vault?.ticker}
                  </div>
                </div>
              {/if}
            </span>
          {/if}
          {#if !((activeTab === 'deposit' && inputUnderlying > 0) || (activeTab === 'withdraw' && withdrawUnderlying > 0)) && (currentUnderlying + pendingUnderlying) > 0}
            <span class="usd-value">${formatUSDC((currentUnderlying + pendingUnderlying) * (underlyingPrice || 0))}</span>
          {/if}
        </span>
        {#if (activeTab === 'deposit' && inputUnderlying > 0) || (activeTab === 'withdraw' && withdrawUnderlying > 0)}
          <span class="arrow">→</span>
          <span class="inline-amount has-value">
            {formatValue(totalUnderlying)} {underlyingToken}
            <span class="usd-value">{formatUSDCompact(totalUnderlying * (underlyingPrice || 0))}</span>
          </span>
        {/if}
      </div>
      <div class="panel-label">30D APR</div>
      <div class="panel-apy panel-apy-large">{apr ? Number(apr).toFixed(2) + '%' : '--'}</div>
      <div class="panel-label">Projected Earnings / Month</div>
      <div class="earnings-row">
        <span class="inline-amount position-tooltip-container {showSimulation ? 'initial-value' : ''}">
          {currentEarningsMonth > 0
            ? `${formatUSDC(currentEarningsMonth)} ${underlyingToken}`
            : `0.00 ${underlyingToken}`}
          <span class="position-tooltip tooltip-explain">
            Projected earnings are calculated as:<br/>
            <b>(Wallet parts + Claimable deposit parts + Pending redeem parts) × PPS × APR</b><br/>
            Pending deposits and claimable redeems are not included until they are converted to parts.
          </span>
          {#if !showSimulation}
            <span class="usd-value">{formatUSDCompact(currentEarningsMonth * (underlyingPrice || 0))}</span>
          {/if}
        </span>
        {#if showSimulation}
          <span class="arrow">→</span>
          <span class="inline-amount has-value">
            {formatValue(futureEarningsMonth)} {underlyingToken}
            <span class="usd-value">{formatUSDCompact(futureEarningsMonth * (underlyingPrice || 0))}</span>
          </span>
        {/if}
      </div>
      <div class="panel-label">Projected Earnings / Year</div>
      <div class="earnings-row">
        <span class="inline-amount position-tooltip-container {showSimulation ? 'initial-value' : ''}">
          {currentEarningsYear > 0
            ? `${formatUSDC(currentEarningsYear)} ${underlyingToken}`
            : `0.00 ${underlyingToken}`}
          <span class="position-tooltip tooltip-explain">
            Projected earnings are calculated as:<br/>
            <b>(Wallet parts + Claimable deposit parts + Pending redeem parts) × PPS × APR</b><br/>
            Pending deposits and claimable redeems are not included until they are converted to parts.
          </span>
          {#if !showSimulation}
            <span class="usd-value">{formatUSDCompact(currentEarningsYear * (underlyingPrice || 0))}</span>
          {/if}
        </span>
        {#if showSimulation}
          <span class="arrow">→</span>
          <span class="inline-amount has-value">
            {formatValue(futureEarningsYear)} {underlyingToken}
            <span class="usd-value">{formatUSDCompact(futureEarningsYear * (underlyingPrice || 0))}</span>
          </span>
        {/if}
      </div>
    </div>

    {#if hasPendingRedeem && Number(pendingRedeemAmount) > 0}
      <div class="pending-box">
        <div class="pending-header">
          <span class="pending-dot"></span>
          <span class="pending-title">Pending redeem{pendingRedeemRequestIds.length > 1 ? 's' : ''}</span>
          {#each pendingRedeemRequestIds as reqId}
            <span class="pending-badge">{reqId}</span>
          {/each}
        </div>
        <div class="pending-row">
          <span class="pending-amount">{formatValue(truncateTo2Decimals(Number(pendingRedeemAmount)))} {vault?.ticker}</span>
        </div>
      </div>
    {/if}

    {#if hasClaimableRedeem && Number(claimableRedeemAmount) > 0}
      <div class="pending-box claimable-box">
        <div class="pending-header">
          <span class="pending-dot claimable-dot"></span>
          <span class="pending-title">Claimable redeem</span>
          {#if claimableRedeemRequestId}
            <span class="pending-badge">#{claimableRedeemRequestId}</span>
          {/if}
        </div>
        <div class="pending-row">
          <div class="pending-amount-group">
            <span class="pending-amount">
              {#if underlyingToken === 'WETH'}
                {formatUSDC((claimableRedeemAssets ?? 0) / 1e18)} {underlyingToken}
              {:else}
                {formatUSDC((claimableRedeemAssets ?? 0) / Math.pow(10, vault?.underlyingTokenDecimals || 6))} {underlyingToken}
              {/if}
            </span>
            <span class="pending-usd-value">
              {#if underlyingToken === 'WETH'}
                {formatUSDCompact(((claimableRedeemAssets ?? 0) / 1e18) * (underlyingPrice || 0))}
              {:else}
                {formatUSDCompact(((claimableRedeemAssets ?? 0) / Math.pow(10, vault?.underlyingTokenDecimals || 6)) * (underlyingPrice || 0))}
              {/if}
            </span>
          </div>
          <button class="claim-btn" on:click={handleClaim}>Claim</button>
        </div>
      </div>
    {/if}
  {/if}

  <ReviewModalDeposit
    open={showReviewModal && activeTab === 'deposit'}
    on:close={handleCloseReview}
    on:confirm={handleConfirmReview}
    vaultName={vault?.name || ''}
    curatorIcon={vault?.curatorIcon || ''}
    depositAmount={depositAmount}
    depositUsd={usdValue}
    apy={apr ? Number(apr).toFixed(2) + '%': '--'}
    tokenSymbol={showEthIcon ? 'ETH' : underlyingToken}
    tokenIcon={showEthIcon ? ethIcon : underlyingTokenIcon}
    depositBefore={truncateTo2Decimals(Number(currentUnderlying)).toString()}
    depositAfter={truncateTo2Decimals(Number(totalUnderlying)).toString()}
    depositBeforeUsd={`$${truncateTo2Decimals(Number(currentUnderlying) * (underlyingPrice || 1))}`}
    depositAfterUsd={`$${truncateTo2Decimals(Number(totalUnderlying) * (underlyingPrice || 1))}`}
    vaultId={vaultId}
    walletAddress={$wallet.address}
    pendingAmount={pendingAmount}
    latestPps={latestPps}
    underlyingToken={showEthIcon ? 'WETH' : underlyingToken}
  />

  <ReviewModalWithdraw
    open={showReviewModal && activeTab === 'withdraw'}
    on:close={handleCloseReview}
    on:confirm={handleConfirmReview}
    vaultName={vault?.name || ''}
    curatorIcon={vault?.curatorIcon || ''}
    withdrawAmount={depositAmount}
    withdrawUsd={usdValue}
    apy={apr ? Number(apr).toFixed(2) + '%': '--'}
    tokenSymbol={vault?.ticker || ''}
    tokenIcon={underlyingTokenIcon}
    sharesBefore={formattedVaultUserShares}
    sharesAfter={String(Number(formattedVaultUserShares) - Number(depositAmount))}
    sharesBeforeUsd={`${(Number(vaultUserShares) * Number(latestPps)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${underlyingToken}`}
    sharesAfterUsd={`${(Number(Number(vaultUserShares) - Number(depositAmount)) * Number(latestPps)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${underlyingToken}`}
    vaultId={vaultId}
    walletAddress={$wallet.address}
    underlyingToken={underlyingToken}
    latestPps={latestPps}
    underlyingPrice={underlyingPrice || 1}
    withdrawBeforeUnderlying={withdrawBeforeUnderlying}
    withdrawAfterUnderlying={withdrawAfterUnderlying}
    pendingUnderlying={pendingUnderlying}
  />
</div>

<style>
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.panel-box {
  background: rgba(10, 34, 58, 0.503);
  border-radius: 0.75rem;
  box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
  padding: 2rem 1.25rem;
  margin-bottom: 0.1rem;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.panel-box:first-child {
  background: rgba(15, 45, 75, 0.7);
  border: 1px solid rgba(77, 168, 255, 0.2);
  box-shadow: 0 4px 20px rgba(77, 168, 255, 0.15),
              0 0 30px rgba(77, 168, 255, 0.1);
  position: relative;
  overflow: hidden;
  margin-bottom: 0rem;
}

.panel-box:first-child::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(77, 168, 255, 0.1),
    transparent
  );
  animation: shine 5s infinite;
}

.panel-box.no-animation::before {
  animation: none !important;
}

@keyframes shine {
  0% {
    left: -100%;
  }
  20% {
    left: 100%;
  }
  100% {
    left: 100%;
  }
}
.panel-title {
  font-size: 1rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  color: #b4c6ef;
}
.token-icon {
  width: 1.2em;
  height: 1.2em;
}
.panel-amount {
  font-size: 2.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: rgba(255, 255, 255, 0.2);
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.panel-amount:focus {
  outline: none;
  color: #fff;
}

.panel-amount::placeholder {
  color: rgba(255, 255, 255, 0.2);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.panel-amount.has-value {
  color: #fff;
}

.panel-label {
  color: #7da2c1;
  font-size: 0.95rem;
  margin-top: 0.5rem;
  margin-bottom: 0.75rem;
}
.panel-apy {
  font-size: 1.25rem;
  font-weight: 500;
  background: linear-gradient(3deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  /* text-shadow: 0 0 20px rgba(77, 168, 255, 0.2); */
  margin-bottom: 0.75rem;
}
.connect-wallet {
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
  width: 100%;
}
.connect-wallet.withdraw {
  background: rgba(10, 34, 58, 0.503);
  color: #b4c6ef;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: none;
}
.connect-wallet.withdraw:not(:disabled):not(.disabled):hover {
  background: rgba(10, 34, 58, 0.7);
  color: #fff;
  box-shadow: none;
}
.connect-wallet:not(:disabled):not(.disabled):hover {
  transform: translateY(-2px);
  box-shadow: 
    0 6px 20px rgba(77, 168, 255, 0.4),
    0 0 30px rgba(77, 168, 255, 0.6);
}

/* Chrome, Safari, Edge, Opera */
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Firefox */
input[type="number"] {
  -moz-appearance: textfield;
}

.panel-box .panel-amount[readonly] {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  background: transparent;
  border: none;
  padding: 0;
  width: 100%;
  text-align: left;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.panel-box .panel-label,
.panel-box .panel-apy {
  font-size: 1rem;
  font-weight: 500;
  color: #b4c6ef;
  margin-top: 0.5rem;
  margin-bottom: 0.75rem;
}

.panel-box .panel-apy {
  background: linear-gradient(3deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  /* text-shadow: 0 0 20px rgba(77, 168, 255, 0.2); */
  font-size: 1rem;
  margin-bottom: 0.75rem;
}

.panel-box .panel-apy-large {
  font-size: 1.25rem;
  font-weight: 600;
  background: linear-gradient(3deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  /* text-shadow: 0 0 20px rgba(77, 168, 255, 0.5); */
  color: transparent;
  margin-bottom: 1.25rem;
}

.position-row, .earnings-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.15rem;
  margin-bottom: 1.25rem;
}
.arrow {
  font-size: 1.2rem;
  color: #4DA8FF;
  font-weight: bold;
  margin: 0 0.2rem;
}
.position-input {
  margin-bottom: 0.5rem;
}
.panel-amount {
  display: inline;
}
.inline-amount {
  display: inline;
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  font-family: inherit;
  margin: 0;
  padding: 0;
}
.inline-amount.has-value {
  color: #fff;
}
.inline-amount.initial-value {
  color: rgba(255, 255, 255, 0.2);
}

.panel-box > *:last-child {
  margin-bottom: 0 !important;
}

.usd-value {
  color: #7da2c1;
  font-size: 0.9em;
  margin-left: 0.5rem;
  font-weight: 500;
}

.balance-info {
  font-size: 0.875rem;
  color: #b4c6ef;
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.balance {
  color: #b4c6ef;
}

.loading {
  color: #7da2c1;
  font-style: italic;
}

.panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.panel-row-balance {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 0.25rem;
  margin-bottom: 0.5rem;
}
.balance-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.max-btn {
  background: #232c3b;
  color: #b4c6ef;
  border: none;
  border-radius: 6px;
  padding: 0.2rem 0.8rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.max-btn:hover {
  background: #2a3650;
  color: #fff;
}

.usd-value-row {
  margin-top: 0.5rem;
  font-size: 1.15rem;
  color: #7da2c1;
  font-weight: 600;
  text-align: left;
}
.balance-row {
  margin-top: 0.15rem;
  font-size: 1rem;
  color: #b4c6ef;
  text-align: left;
}
.max-btn-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.15rem;
  margin-bottom: 0.5rem;
}
.balance-max-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.15rem;
  margin-bottom: 0.5rem;
}

.usd-balance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}
.usd-value-inline {
  font-size: 1.15rem;
  color: #7da2c1;
  font-weight: 600;
}
.balance-max-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.connect-wallet.disabled,
.connect-wallet:disabled {
  background: rgba(10, 34, 58, 0.503);
  color: #7da2c1;
  cursor: not-allowed;
  box-shadow: none;
  opacity: 1;
  transition: none;
}
.connect-wallet.disabled:hover,
.connect-wallet:disabled:hover {
  background: rgba(10, 34, 58, 0.7);
  color: #7da2c1;
  cursor: not-allowed;
  box-shadow: none;
}

.balance-blur {
  filter: blur(3px);
  opacity: 0.5;
  pointer-events: none;
  user-select: none;
  transition: filter 0.2s, opacity 0.2s;
}

.insufficient-balance-msg {
  color: #7da2c1;
  font-size: 1rem;
  margin-top: 0.15rem;
  margin-bottom: 0.25rem;
  text-align: left;
  font-weight: 500;
}

.position-usd {
  color: #7da2c1;
  font-size: 1rem;
  margin-left: 0.75rem;
  font-weight: 500;
}

.position-tooltip-container {
  position: relative;
  display: inline-block;
}
.position-tooltip {
  visibility: hidden;
  opacity: 0;
  position: absolute;
  left: 0;
  transform: translateY(-110%);
  background: rgb(10,34,58);
  color: #fff;
  text-align: left;
  padding: 0.75rem 1.1rem;
  border-radius: 0.7rem;
  white-space: nowrap;
  font-size: 0.98rem;
  font-weight: 400;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0,0,0,0.18);
  border: 1px solid rgba(77,168,255,0.15);
  transition: opacity 0.18s, visibility 0.18s;
  pointer-events: none;
}
.position-tooltip-container:hover .position-tooltip,
.position-tooltip-container:focus-within .position-tooltip {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}
.position-tooltip .tooltip-line {
  margin-bottom: 0.35em;
  font-size: 1em;
}
.position-tooltip .tooltip-separator {
  border: none;
  border-top: 1.5px solid #ffffff;
  margin: 0.5em 0;
  opacity: 0.5;
}
.pending-status {
  color: #4DA8FF;
  font-weight: 500;
}

.pending-box {
  background: rgba(10, 34, 58, 0.503);
  border-radius: 0.75rem;
  box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
  padding: 2rem 1.25rem;
  margin-bottom: 0.5rem;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  animation: slideIn 0.5s ease-out;
  transform-origin: right;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.pending-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  color: #b4c6ef;
}
.pending-dot {
  width: 0.6em;
  height: 0.6em;
  background: #4DA8FF;
  border-radius: 50%;
  display: inline-block;
  margin-right: 0.3em;
}
.pending-title {
  color: #b4c6ef;
  font-weight: 500;
}
.pending-badge {
  background: #183a5a;
  color: #4DA8FF;
  border-radius: 0.4em;
  padding: 0.1em 0.6em;
  font-size: 0.95em;
  font-weight: 600;
  margin-left: 0.3em;
}
.pending-row {
  display: flex;
  align-items: center;
  width: 100%;
  margin: 0.5rem 0 0.5rem 0;
}
.pending-amount {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
}

/* Onglets Deposit/Withdraw */
.vault-tabs {
  display: flex;
  width: 100%;
  margin-bottom: 0.5rem;
  border-radius: 0.75rem;
  overflow: hidden;
  background: none;
}
.vault-tab {
  flex: 1 1 0;
  border: none;
  border-radius: 0;
  padding: 0.9rem 0;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: #b4c6ef;
  transition: all 0.2s ease;
  outline: none;
  position: relative;
  overflow: hidden;
}
.vault-tab.active {
  background: rgba(10, 34, 58, 0.503);
  color: #fff;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 15px rgba(77, 168, 255, 0.1);
}
.vault-tab:not(.active) {
  background: transparent;
  color: #b4c6ef;
  border: none;
  border-radius: 0.75rem;
}
.vault-tab:not(.active):hover {
  background: rgba(77, 168, 255, 0.1);
  color: #fff;
}
.vault-tab:first-child {
  margin-right: 0.25rem;
}
.vault-tab:last-child {
  margin-left: 0.25rem;
}

.claimable-box {
  background: rgba(10, 34, 58, 0.503);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
  animation: slideIn 0.5s ease-out;
}

.claimable-dot {
  background: #4DA8FF;
  box-shadow: 0 0 10px rgba(77, 168, 255, 0.5);
}

.claim-btn-container {
  width: 120px;
  margin-left: auto;
}

.claim-btn {
  background: linear-gradient(135deg, #fff 0%, #4DA8FF 100%);
  color: #0d111c;
  border: none;
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  width: 120px;
  text-align: center;
  box-shadow: 
    0 4px 15px rgba(77, 168, 255, 0.3),
    0 0 25px rgba(77, 168, 255, 0.5);
  margin-left: auto;
}

.claim-btn:hover {
  background: linear-gradient(135deg, #fff 0%, #4DA8FF 100%);
  box-shadow: 
    0 6px 20px rgba(77, 168, 255, 0.4),
    0 0 30px rgba(77, 168, 255, 0.6);
}

.claim-text {
  display: inline-block;
  width: 100%;
  text-align: center;
}

.claim-btn:not(:disabled):hover {
  background: linear-gradient(135deg, #fff 0%, #4DA8FF 100%);
  box-shadow: 
    0 6px 20px rgba(77, 168, 255, 0.4),
    0 0 30px rgba(77, 168, 255, 0.6);
}

.claim-btn:disabled {
  background: rgba(10, 34, 58, 0.503);
  color: #7da2c1;
  cursor: not-allowed;
  box-shadow: none;
  opacity: 1;
}

.pending-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 0.5rem 0 0.5rem 0;
}

.pending-amount-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.pending-usd-value {
  color: #7da2c1;
  font-size: 0.9em;
  font-weight: 500;
}

.token-selector {
  background: #232c3b;
  color: #b4c6ef;
  border: none;
  border-radius: 6px;
  padding: 0.2rem 0.8rem;
  font-size: 0.95rem;
  font-weight: 600;
  margin-right: 0.5rem;
}
.token-selector:focus {
  outline: none;
  background: #2a3650;
  color: #fff;
}

.token-toggle-group {
  display: flex;
  gap: 0.5rem;
  margin-right: 0.5rem;
  margin-left: auto;
}
.token-toggle {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: #232c3b;
  color: #b4c6ef;
  border: 1.5px solid transparent;
  border-radius: 6px;
  padding: 0.2rem 0.8rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, border 0.18s;
}
.token-toggle.selected {
  background: #2a3650;
  color: #fff;
  border: 1.5px solid #4DA8FF;
}
.token-toggle-icon {
  width: 1.2em;
  height: 1.2em;
}

.position-tooltip .tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}

.tooltip-line {
  margin-bottom: 0.15em;
  font-size: 1em;
}

.tooltip-total {
  font-weight: bold;
  padding: 0.25em 0;
  font-size: 1.05em;
}

.tooltip-separator {
  height: 1.5px;
  background: #ffffff;
  opacity: 0.5;
  width: 100%;
  margin: 0.4em 0;
  border: none;
}

/* Ajout du style pour la tooltip explicative */
.tooltip-explain {
  max-width: 320px;
  white-space: normal;
  font-size: 0.7em;
  line-height: 1.4;
  left: 50%;
  transform: translateX(-50%) translateY(-110%);
  min-width: 220px;
}

.inline-amount.position-tooltip-container {
  min-width: 60px; /* Ajuste selon le rendu souhaité */
}
</style> 