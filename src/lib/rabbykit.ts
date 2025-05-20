import { createModal, getDefaultConfig } from "@rabby-wallet/rabbykit";
import { createConfig, http, switchChain } from "@wagmi/core";
import { mainnet, base } from "@wagmi/core/chains";
import { env } from '$env/dynamic/public';

export const config = createConfig(
  getDefaultConfig({
    appName: "app.detrade.fund",
    projectId: "47ebbeffc901f4eafb8387af2a244145", // ton vrai projectId WalletConnect
    chains: [base, mainnet], // BASE en premier = par défaut
    transports: {
      [mainnet.id]: http(env.PUBLIC_ETHEREUM_RPC),
      [base.id]: http(env.PUBLIC_BASE_RPC),
    },
  })
);

export const rabbykit = createModal({
  wagmi: config,
  theme: "light", // mode clair par défaut
  themeVariables: {
    "--rk-font-family": "Inter, Arial, sans-serif",
    "--rk-border-radius": "16px"
  }
});

async function ensureBaseNetwork() {
  try {
    await switchChain({ chainId: base.id });
    // Succès : l'utilisateur est maintenant sur Base
  } catch (e) {
    // L'utilisateur a refusé ou le wallet ne supporte pas le switch automatique
    alert("Merci de sélectionner le réseau Base dans votre wallet.");
  }
}

function connectRabbyKit() {
  rabbykit.open({
    onConnect: () => {
      updateAddress();
      ensureBaseNetwork();
    },
    // ...
  });
}