import { createModal, getDefaultConfig } from "@rabby-wallet/rabbykit";
import { createConfig, http, switchChain } from "@wagmi/core";
import { mainnet, base } from "@wagmi/core/chains";
import { env } from '$env/dynamic/public';
import { getAccount } from '@wagmi/core';

// Base configuration for Wagmi
export const config = createConfig(
  getDefaultConfig({
    appName: "app.detrade.fund",
    projectId: "47ebbeffc901f4eafb8387af2a244145",
    chains: [base, mainnet],
    transports: {
      [mainnet.id]: http(env.PUBLIC_ETHEREUM_RPC),
      [base.id]: http(env.PUBLIC_BASE_RPC),
    },
  })
);

// Function to detect if on mobile device
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Function to open MetaMask on mobile
function openMetaMask() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const url = isIOS 
    ? 'https://metamask.app.link/dapp/app.detrade.fund'
    : 'https://metamask.app.link/dapp/app.detrade.fund';
  window.location.href = url;
}

export const rabbykit = createModal({
  wagmi: config,
  theme: "dark",
  themeVariables: {
    "--rk-font-family": "Inter, Arial, sans-serif",
    "--rk-border-radius": "16px",
    "--rk-primary-button-bg": "#4DA8FF",
    "--rk-primary-button-color": "#ffffff",
    "--rk-primary-button-hover-bg": "#60b5ff",
    "--rk-primary-button-hover-color": "#ffffff",
    "--rk-primary-button-border": "1px solid rgba(255, 255, 255, 0.1)",
    "--rk-primary-button-border-radius": "12px"
  }
});

async function ensureBaseNetwork() {
  try {
    await switchChain(config, { chainId: base.id });
  } catch (e) {
    alert("Please select the Base network in your wallet.");
  }
}

function connectRabbyKit() {
  if (isMobile()) {
    // On mobile, open MetaMask directly
    openMetaMask();
  } else {
    // On desktop, use the normal modal
    rabbykit.open({
      onConnect: () => {
        const account = getAccount(config);
        if (account?.address) {
          ensureBaseNetwork();
        }
      },
      onConnectError: (e) => {
        console.error('Connection error:', e);
      }
    });
  }
}