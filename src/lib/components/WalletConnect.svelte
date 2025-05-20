<script lang="ts">
  import { rabbykit, config } from '$lib/rabbykit';
  import { base, mainnet } from '@wagmi/core/chains';
  import { getAccount, watchAccount, disconnect } from '@wagmi/core';
  import { onMount, onDestroy } from 'svelte';
  import { wallet } from '$lib/stores/wallet';
  import { transactions } from '$lib/stores/transactions';

  type NetworkId = typeof base.id | typeof mainnet.id;
  type NetworkInfo = {
    id: NetworkId;
    name: string;
    icon: string;
  };

  // Réseaux supportés
  const NETWORKS: Record<NetworkId, NetworkInfo> = {
    [base.id]: { id: base.id, name: 'Base', icon: '/base.webp' },
    [mainnet.id]: { id: mainnet.id, name: 'Ethereum', icon: '/eth.webp' }
  };

  let address: string = "";
  let chainId: NetworkId | null = null;
  let error: string = "";
  let isNetworkMenuOpen = false;
  let unsubscribeAccount: (() => void) | undefined;
  let isTransactionPending = false;
  $: isTransactionPending = $transactions.isPending;

  function formatAddress(addr: string | null): string {
    if (!addr) return '';
    return addr.length > 10 ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : addr;
  }

  function updateAccount() {
    const acc = getAccount(config);
    address = acc?.address ?? "";
    chainId = (acc?.chainId as NetworkId) ?? null;
    
    // Update wallet store
    wallet.updateAddress(address);
    wallet.updateChainId(chainId);
  }

  function handleClickOutside(event: MouseEvent) {
    const menu = document.querySelector('.network-logo-menu');
    if (menu && !menu.contains(event.target as Node)) {
      isNetworkMenuOpen = false;
    }
  }

  onMount(() => {
    updateAccount();
    unsubscribeAccount = watchAccount(config, {
      onChange: updateAccount
    });
    rabbykit.subscribeModalState((open) => {
      if (!open) updateAccount();
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('mousedown', handleClickOutside);
    }
  });

  onDestroy(() => {
    unsubscribeAccount?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', handleClickOutside);
    }
  });

  function connectRabbyKit() {
    error = "";
    rabbykit.open({
      onConnect: () => {
        updateAccount();
      },
      onConnectError: (e) => {
        // Suppression du message d'erreur
      },
      onModalClosed: () => {
        updateAccount();
      }
    });
  }

  async function disconnectWallet() {
    try {
      await disconnect(config);
      address = "";
      chainId = null;
      wallet.disconnect();
    } catch (e) {
      error = "Erreur lors de la déconnexion";
    }
  }

  async function handleNetworkSwitch(targetChainId: NetworkId) {
    if (chainId !== targetChainId) {
      try {
        await switchChain(config, { chainId: targetChainId });
        isNetworkMenuOpen = false;
      } catch (e) {
        alert("Impossible de changer de réseau automatiquement. Merci de le faire dans votre wallet.");
      }
    }
  }
</script>

<div class="wallet-section">
  <div class="wallet-content">
    {#if address}
      <div class="network-logo-menu" style="position: relative;">
        <button 
          class="network-logo-btn"
          aria-label="Network"
          type="button"
          on:click={() => { if (chainId !== base.id) handleNetworkSwitch(base.id); }}
          disabled={chainId === base.id}
        >
          {#if chainId && NETWORKS[chainId]}
            <img src={NETWORKS[chainId].icon} alt={NETWORKS[chainId].name} />
          {:else}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6L12 12M12 6L6 12" stroke="#4DA8FF" stroke-width="2" stroke-linecap="round"/>
            </svg>
          {/if}
        </button>
      </div>
      <button class="connect-btn connected accent" on:click={disconnectWallet}>
        {#if isTransactionPending}
          <div class="pending-indicator">
            <div class="spinner"></div>
            <span>Pending</span>
          </div>
        {:else}
          {formatAddress(address)}
        {/if}
      </button>
    {:else}
      <button class="connect-btn" on:click={connectRabbyKit}>
        Connect Wallet
      </button>
    {/if}
    {#if error}
      <div class="error">{error}</div>
    {/if}
  </div>
</div>

<style>
.wallet-section {
  display: flex;
  align-items: center;
  gap: 1rem;
  position: relative;
  justify-content: flex-end;
}
.wallet-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-content: flex-end;
}
.connect-btn {
  /* Dimensions et espacement */
  padding: 0.75rem 1.25rem;
  min-width: 120px;
  width: 160px; /* Largeur fixe */
  height: 40px;
  
  /* Style de base */
  background: linear-gradient(135deg, #fff 0%, #4DA8FF 100%);
  color: #0d111c;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  
  /* Centrage du texte */
  display: flex;
  align-items: center;
  justify-content: center;
  
  /* Transitions */
  transition: all 0.2s ease;
  cursor: pointer;

  /* Effet de glow */
  box-shadow: 
    0 4px 15px rgba(77, 168, 255, 0.3),
    0 0 25px rgba(77, 168, 255, 0.5);
}

.connect-btn:hover {
  transform: translateY(-2px);
  box-shadow: 
    0 6px 20px rgba(77, 168, 255, 0.4),
    0 0 30px rgba(77, 168, 255, 0.6);
}

.connect-btn:active {
  transform: translateY(0);
  box-shadow: 
    0 2px 10px rgba(77, 168, 255, 0.3),
    0 0 20px rgba(77, 168, 255, 0.4);
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.wallet-address {
  color: #60a5fa;
  font-size: 0.95rem;
  background: rgba(96, 165, 250, 0.08);
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-family: monospace;
}
.disconnect-btn {
  background: #222e3a;
  color: #60a5fa;
  border: 1px solid #60a5fa;
  border-radius: 8px;
  padding: 0.4rem 1rem;
  margin-left: 0.5rem;
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.2s;
}
.disconnect-btn:hover {
  background: #1a2230;
}
.error {
  color: #ff4d4d;
  font-size: 0.9rem;
  margin-left: 1rem;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: #181f2a;
  border-radius: 14px;
  padding: 2rem 1.5rem 1.5rem 1.5rem;
  min-width: 320px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.modal h3 {
  color: #fff;
  margin-bottom: 1.2rem;
  font-size: 1.2rem;
}
.wallet-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  margin-bottom: 1.2rem;
}
.wallet-option {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  background: #232c3b;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.7rem 1.2rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  width: 100%;
}
.wallet-option:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.wallet-option:hover {
  background: #2a3650;
}
.wallet-icon {
  width: 26px;
  height: 26px;
}
.close-btn {
  margin-top: 0.5rem;
  background: none;
  color: #94a3b8;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  text-decoration: underline;
}

/* Nouveau style pour le bouton logo réseau et le menu déroulant */
.network-logo-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: fit-content;
}
.network-logo-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(77, 168, 255, 0.2) 100%);
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  cursor: pointer;
  transition: box-shadow 0.18s, border 0.18s, background 0.18s, color 0.18s;
  padding: 0;
  vertical-align: middle;
  margin: 0;
}
.network-logo-btn img {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  background: transparent;
  display: block;
  margin-bottom: 1px;
}
.network-logo-dropdown {
  position: absolute;
  left: 0;
  right: auto;
  top: calc(100% + 10px);
  min-width: 100%;
  width: max-content;
  margin: 0;
  transform: none;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 8px 32px rgba(77,168,255,0.10), 0 1.5px 8px rgba(0,0,0,0.08);
  padding: 0.7rem 0 0.7rem 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  animation: fadeIn 0.18s;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.dropdown-arrow {
  position: absolute;
  top: -13px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 18px;
  overflow: visible;
}
.dropdown-arrow::after {
  content: '';
  display: block;
  width: 22px;
  height: 22px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(77,168,255,0.10), 0 1.5px 8px rgba(0,0,0,0.08);
  transform: rotate(45deg) translateY(-10px);
  margin: 0 auto;
}
.network-logo-option {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  background: #f6f8fa;
  border: none;
  border-radius: 14px;
  padding: 1.1rem 1.5rem;
  font-size: 1.15rem;
  font-weight: 600;
  color: #181f2a;
  cursor: pointer;
  transition: background 0.16s, color 0.16s;
  margin: 0 1rem;
  box-shadow: 0 1px 2px rgba(77,168,255,0.04);
}
.network-logo-option.current,
.network-logo-option:disabled {
  background: #e6f0ff;
  color: #0d111c;
  font-weight: 700;
  cursor: default;
  box-shadow: 0 2px 8px rgba(77,168,255,0.08);
}
.network-logo-option img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  object-fit: cover;
  box-shadow: 0 1px 4px rgba(77,168,255,0.08);
}
.network-logo-option span {
  font-size: 1.15rem;
  font-weight: 600;
  color: #181f2a;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}
.connect-btn.connected {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.25rem;
}
/* Accent style uniquement quand connecté */
.connect-btn.accent {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(77, 168, 255, 0.2) 100%);
  color: var(--color-accent);
  border: 1px solid var(--color-accent);
}

/* Styles pour l'indicateur de transaction en cours */
.pending-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(77, 168, 255, 0.3);
  border-top-color: #4DA8FF;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  flex-shrink: 0; /* Empêche le spinner de rétrécir */
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Ajuster le style du bouton quand il y a une transaction en cours */
.connect-btn.connected.accent .pending-indicator {
  color: #4DA8FF;
  font-size: 0.95rem;
  font-weight: 500;
}

/* Version mobile */
@media (max-width: 640px) {
  .connect-btn {
    font-size: 1rem;
    padding: 0.875rem 1.75rem;
    min-width: 160px;
    width: 180px; /* Largeur fixe plus grande sur mobile */
  }
}
</style> 