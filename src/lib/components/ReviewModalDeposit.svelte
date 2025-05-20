<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { pps } from '$lib/stores/pps';
  import { ALL_VAULTS } from '$lib/vaults';
  import { transactions } from '$lib/stores/transactions';
  import { prices } from '$lib/stores/prices';
  import { latestPps } from '$lib/stores/latest_pps';
  const dispatch = createEventDispatcher();

  export let open = false;
  export let vaultName: string = '';
  export let curatorIcon: string = '';
  export let depositAmount: string = '';
  export let depositUsd: string = '';
  export let apy: string = '';
  export let tokenSymbol: string = '';
  export let tokenIcon: string = '';
  export let depositBefore: string = '';
  export let depositAfter: string = '';
  export let walletAddress: string = '';
  export let vaultId: string = '';
  export let pendingAmount: string = '0';
  export let initialLatestPps: string = '1';
  export let underlyingToken: string = '';
  export let vaultTicker: string = '';

  let underlyingPrice = 0;
  let unsubscribe: () => void;
  let currentLatestPps = Number(initialLatestPps);

  // Récupérer le ticker du vault
  $: {
    const vault = ALL_VAULTS.find(v => v.id === vaultId);
    if (vault) {
      vaultTicker = vault.ticker;
    }
  }

  $: if (unsubscribe) unsubscribe();
  $: unsubscribe = prices.subscribe(state => {
    if (underlyingToken && state[underlyingToken]) {
      underlyingPrice = state[underlyingToken].price;
    } else {
      underlyingPrice = 0;
    }
  });

  // Souscription au store latestPps
  $: if ($latestPps[vaultId]?.data?.pps) {
    currentLatestPps = Number($latestPps[vaultId].data.pps);
  }

  function truncateTo2Decimals(value: number) {
    if (vaultId === 'detrade-core-eth' && value < 1) {
      return Math.floor(value * 10000) / 10000;
    }
    return Math.trunc(value * 100) / 100;
  }

  function cropTo4Decimals(value: number) {
    return Math.floor(value * 10000) / 10000;
  }

  // Calcul de la valeur en tokens sous-jacents
  $: currentUnderlying = Number(depositBefore);
  $: pendingUnderlying = Number(pendingAmount);
  $: inputUnderlying = Number(depositAmount);
  $: totalUnderlying = currentUnderlying + inputUnderlying + pendingUnderlying;

  // Calcul de la valeur en USD
  $: usdValue = truncateTo2Decimals(inputUnderlying * underlyingPrice);

  // Calcul de l'exchange rate (1 / latestPps), crop à 4 décimales
  $: exchangeRate = (() => {
    const ppsValue = currentLatestPps;
    if (isNaN(ppsValue) || ppsValue <= 0) {
      return '1.0000';
    }
    const inversePps = 1 / ppsValue;
    return cropTo4Decimals(inversePps).toFixed(4);
  })();

  $: console.log('Modal state:', { open });
  $: console.log('[ReviewModalDeposit] underlyingPrice:', underlyingPrice, 'depositAmount:', depositAmount);

  function handleClose() {
    console.log('Closing modal');
    open = false;
    dispatch('close');
  }

  async function handleConfirm() {
    console.log('Starting deposit transaction construction...');
    console.log('Vault ID:', vaultId);
    console.log('Wallet Address:', walletAddress);
    console.log('Initial deposit amount:', depositAmount);

    const vault = ALL_VAULTS.find(v => v.id === vaultId);
    if (!vault) {
      console.error('Vault not found for ID:', vaultId);
      return;
    }
    console.log('Found vault:', vault.name);
    console.log('Token decimals:', vault.underlyingTokenDecimals);

    // Gestion spéciale pour le dépôt d'ETH natif
    if (vaultId === 'detrade-core-eth') {
      const amount = BigInt(Math.floor(Number(depositAmount) * 1e18));
      console.log('ETH deposit amount in wei:', amount.toString());
      
      const transaction = {
        func: "requestDeposit",
        params: [
          amount,
          walletAddress,
          walletAddress
        ],
        value: amount
      };
      console.log('ETH deposit transaction object:', transaction);
      
      // Mettre à jour l'état de la transaction
      transactions.setPending();
      
      dispatch('confirm', transaction);
      console.log('ETH deposit transaction dispatched to parent component');
      return;
    }

    // Pour les autres tokens
    const amount = Number(depositAmount) * Math.pow(10, vault.underlyingTokenDecimals);
    console.log('Converted amount with decimals:', amount);

    const transaction = {
      func: "requestDeposit",
      params: [
        amount,
        walletAddress,
        walletAddress
      ]
    };
    console.log('Final transaction object:', transaction);

    // Mettre à jour l'état de la transaction
    transactions.setPending();
    
    dispatch('confirm', transaction);
    console.log('Transaction dispatched to parent component');
  }

  $: depositBeforeLocal = (() => {
    const currentUnderlying = Number(depositBefore);
    const pendingUnderlying = Number(pendingAmount);
    if (isNaN(currentUnderlying) || isNaN(pendingUnderlying)) return depositBefore;
    const total = currentUnderlying + pendingUnderlying;
    if (vaultId === 'detrade-core-eth' && total < 1) {
      return total.toFixed(4);
    }
    return truncateTo2Decimals(total).toString();
  })();

  $: depositAfterLocal = (() => {
    const currentUnderlying = Number(depositBefore);
    const inputUnderlying = Number(depositAmount);
    const pendingUnderlying = Number(pendingAmount);
    if (isNaN(currentUnderlying) || isNaN(inputUnderlying) || isNaN(pendingUnderlying)) return depositBefore;
    const total = currentUnderlying + inputUnderlying + pendingUnderlying;
    if (vaultId === 'detrade-core-eth' && total < 1) {
      return total.toFixed(4);
    }
    return truncateTo2Decimals(total).toString();
  })();

  $: depositUsdValue = (!isNaN(Number(depositAmount)) && Number(underlyingPrice) > 0)
    ? truncateTo2Decimals(Number(depositAmount) * Number(underlyingPrice))
    : '0.00';

  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
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
      <div class="deposit-title-label">Deposit</div>
      <div class="row deposit-row-amount">
        <div class="deposit-amount-group">
          <span class="deposit-big">{depositAmount} {tokenSymbol}</span>
          <span class="usd-badge">${depositUsdValue}</span>
        </div>
        <span class="token-icon-align">{#if tokenIcon}<img src={tokenIcon} alt={tokenSymbol} class="token-icon-right" />{/if}</span>
      </div>
      <div class="separator"></div>
      <div class="row deposit-evolution-row">
        <span class="label">Deposit ({tokenSymbol})</span>
        <span class="evolution-center">
          <span class="evolution-amount">{depositBeforeLocal}</span>
          <span class="arrow">→</span>
          <span class="evolution-amount">{depositAfterLocal}</span>
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
        <span class="value">1 {underlyingToken} ≈ {exchangeRate} <span class="gradient-text">{vaultTicker}</span></span>
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
  border: 1.5px solid rgba(77, 168, 255, 0.22);
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
.deposit-row-amount {
  margin-bottom: 0.2rem;
}
.deposit-amount-group {
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
.deposit-big {
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
.deposit-evolution-row {
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
  box-shadow: none;
}
.confirm-btn:hover {
  transform: translateY(-2px);
  box-shadow: none;
}
.modal-terms {
  font-size: 0.95rem;
  color: #7da2c1;
  text-align: center;
  margin-top: 0.5rem;
}
.modal-terms a {
  color: #4DA8FF;
  text-decoration: underline;
}
.deposit-title-label {
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
</style> 