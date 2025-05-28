<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { latestPps } from '$lib/stores/latest_pps';
  import { browser } from '$app/environment';
  const dispatch = createEventDispatcher();

  export let open = false;
  export let vaultName: string = '';
  export let curatorIcon: string = '';
  export let withdrawAmount: string = '';
  export let withdrawUsd: string = '';
  export let apy: string = '';
  export let tokenSymbol: string = '';
  export let tokenIcon: string = '';
  export let sharesBefore: string = '0';
  export let sharesAfter: string = '0';
  export let sharesBeforeUsd: string = '';
  export let sharesAfterUsd: string = '';
  export let walletAddress: string = '';
  export let vaultId: string = '';
  export let underlyingToken: string = '';
  export let initialLatestPps: string = '1';
  export let underlyingPrice: number = 1;
  export let withdrawBeforeUnderlying: number = 0;
  export let withdrawAfterUnderlying: number = 0;
  export let pendingUnderlying: number = 0;

  let currentLatestPps = safeNumber(initialLatestPps);

  // Fonction pour récupérer le dernier PPS
  async function fetchLatestPps() {
    if (!browser || !vaultId) return;
    
    try {
      const response = await fetch(`/api/vaults/${vaultId}/metrics/pps?latest=true`);
      if (!response.ok) {
        console.error('Error fetching latest PPS:', response.status);
        return;
      }
      const data = await response.json();
      if (data?.latestPps?.pps) {
        currentLatestPps = safeNumber(data.latestPps.pps);
      }
    } catch (error) {
      console.error('Error fetching latest PPS:', error);
    }
  }

  onMount(() => {
    if (browser) {
      fetchLatestPps();
    }
  });

  function truncateTo2Decimals(value: number) {
    return Math.trunc(value * 100) / 100;
  }

  function formatUSDC(value: number) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function cropTo4Decimals(value: number) {
    const cropped = Math.floor(value * 10000) / 10000;
    return cropped.toFixed(4);
  }

  // Fonction utilitaire pour parser en nombre sécurisé
  function safeNumber(val: any, fallback = 0) {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  }

  function handleClose() {
    open = false;
    dispatch('close');
  }

  function handleConfirm() {
    // Convertir le montant en parts (shares) en uint256 (wei)
    const shares = BigInt(Math.floor(Number(withdrawAmount) * 1e18)).toString();
    const transaction = {
      func: "claimSharesAndRequestRedeem",
      params: [shares]
    };
    dispatch('confirm', transaction);
  }

  // Calcul de la valeur en tokens sous-jacents
  $: underlyingValue = safeNumber(withdrawAmount) * currentLatestPps;
  // Calcul de la valeur en USD (parts × PPS × prix du token sous-jacent)
  $: usdValue = underlyingValue * safeNumber(underlyingPrice);
  // Calcul des valeurs before/after en underlying token (incluant les pending)
  $: withdrawBeforeUnderlying = (safeNumber(sharesBefore) * currentLatestPps) + safeNumber(pendingUnderlying);
  $: withdrawAfterUnderlying = (safeNumber(sharesAfter) * currentLatestPps) + safeNumber(pendingUnderlying);
</script>

{#if open}
  <div class="modal-overlay" on:click={handleClose}></div>
  <div class="modal-content">
    <button class="close-btn" on:click={handleClose}>×</button>
    <h2 class="review-title">Review</h2>
    <div class="modal-box-structure">
      <div class="vault-header">
        {#if curatorIcon}
          <img src={curatorIcon} alt="curator" class="curator-icon" />
        {/if}
        <span class="vault-title">{vaultName}</span>
      </div>
      <div class="withdraw-title-label">Withdraw</div>
      <div class="row withdraw-row-amount">
        <div class="withdraw-amount-group">
          <span class="withdraw-big">
            <span>{withdrawAmount}&nbsp;</span>
            <span class="gradient-text">{tokenSymbol}</span>
          </span>
          <span class="usd-badge">${truncateTo2Decimals(usdValue)}</span>
        </div>
        <span class="token-icon-align">{#if tokenIcon}<img src={tokenIcon} alt={tokenSymbol} class="token-icon-right" />{/if}</span>
      </div>
      <div class="separator"></div>
      <div class="row withdraw-evolution-row">
        <span class="label">Deposit ({underlyingToken})</span>
        <span class="evolution-center">
          <span class="evolution-amount">{formatUSDC(withdrawBeforeUnderlying)} {underlyingToken}</span>
          <span class="arrow">→</span>
          <span class="evolution-amount">{formatUSDC(withdrawAfterUnderlying)} {underlyingToken}</span>
        </span>
      </div>
      <div class="row">
        <span class="label">30D APR</span>
        <span class="value apy">{apy}</span>
      </div>
      <div class="row">
        <span class="label">Completion time</span>
        <span class="value">~ 24 hours</span>
      </div>
      <div class="row">
        <span class="label">Exchange rate</span>
        <span class="value">1 <span class="gradient-text">{tokenSymbol}</span> = {cropTo4Decimals(currentLatestPps)} {underlyingToken}</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="confirm-btn" on:click={handleConfirm}>Confirm</button>
    </div>
  </div>
{/if}

<style>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(10, 34, 58, 0.85);
  backdrop-filter: blur(4px);
  z-index: 1000;
}
.modal-content {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: #101c2c;
  border-radius: 1.2rem;
  box-shadow: 0 8px 40px rgba(25, 62, 182, 0.25), 0 0 60px rgba(77, 168, 255, 0.12);
  padding: 2.2rem 2.2rem 1.2rem 2.2rem;
  min-width: 680px;
  max-width: 850px;
  max-height: 95vh;
  z-index: 1010;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
}
.review-title {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 1.5rem 0;
  text-align: left;
  width: 100%;
}
.close-btn {
  position: absolute;
  top: 1.2rem;
  right: 1.2rem;
  background: rgba(15, 45, 75, 0.7);
  border: none;
  color: #b4c6ef;
  font-size: 2rem;
  cursor: pointer;
  z-index: 1020;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.close-btn:hover {
  background: rgba(77, 168, 255, 0.2);
  color: #fff;
  transform: scale(1.1);
}
.vault-header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 1.2rem;
  width: 100%;
  justify-content: flex-start;
}
.curator-icon {
  width: 2.5em;
  height: 2.5em;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 8px #4DA8FF44;
}
.vault-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #b4c6ef;
}
.modal-box-structure {
  width: 100%;
  background: rgba(15, 45, 75, 0.7);
  border-radius: 1rem;
  padding: 1.5rem 1.3rem 1.3rem 1.3rem;
  margin-bottom: 1.2rem;
  box-shadow: 0 2px 12px rgba(77, 168, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 1rem;
  font-weight: 500;
  margin-bottom: 0.1rem;
}
.withdraw-row-amount {
  margin-bottom: 0.2rem;
}
.withdraw-amount-group {
  display: flex;
  align-items: flex-end;
  gap: 0.7rem;
}
.token-icon-align {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1 1 auto;
  min-width: 2.2em;
}
.withdraw-big {
  font-size: 2.5rem;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  line-height: 1;
}
.usd-badge {
  background: #183a5a;
  color: #b4c6ef;
  border-radius: 0.5em;
  padding: 0.1em 0.7em;
  font-size: 1.1em;
  font-weight: 700;
  margin-left: 0.2em;
  margin-bottom: 0.2em;
}
.token-icon-right {
  width: 2.5em;
  height: 2.5em;
  border-radius: 50%;
  box-shadow: 0 0 8px #4DA8FF44;
}
.separator {
  width: 100%;
  height: 1.5px;
  background: linear-gradient(90deg, rgba(77,168,255,0.12) 0%, rgba(77,168,255,0.25) 50%, rgba(77,168,255,0.12) 100%);
  border-radius: 2px;
  margin: 0.7rem 0 0.7rem 0;
}
.withdraw-evolution-row {
  margin-bottom: 0.2rem;
}
.evolution-center {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  justify-content: center;
}
.evolution-amount {
  font-size: 1.18rem;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.label {
  color: #b4c6ef;
  font-size: 1.05rem;
  font-weight: 500;
}
.value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.13rem;
  font-weight: 600;
  color: #fff;
}
.arrow {
  font-size: 1.2rem;
  color: #4DA8FF;
  font-weight: bold;
  margin: 0 0.2rem;
}
.apy {
  background: linear-gradient(3deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: transparent;
}
.modal-footer {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 1.2rem;
}
.confirm-btn {
  background: linear-gradient(135deg, #fff 0%, #4DA8FF 100%);
  color: #0d111c;
  border: none;
  padding: 0.9rem 2.2rem;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  box-shadow: 0 4px 15px rgba(77, 168, 255, 0.3), 0 0 25px rgba(77, 168, 255, 0.5);
}
.confirm-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(77, 168, 255, 0.4), 0 0 30px rgba(77, 168, 255, 0.6);
}
.withdraw-title-label {
  color: #b4c6ef;
  font-size: 1.05rem;
  font-weight: 500;
  margin-bottom: 0.15rem;
  margin-left: 0.1rem;
  text-align: left;
}
.gradient-text {
  background: linear-gradient(3deg, #fff 0%, #4DA8FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: transparent;
}
.inline-amount.initial-value {
  color: #808080;
}
</style> 