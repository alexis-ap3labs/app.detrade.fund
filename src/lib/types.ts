// Core vault type definition with all required properties
export type Vault = {
  id: string;
  name: string;
  ticker: string;
  curator: string;
  curatorWebsite: string;
  curatorIcon: string;
  underlyingToken: string;
  underlyingTokenIcon: string;
  underlyingTokenDecimals: number;
  network: string;
  chainId: number;
  coingeckoId: string;
  networkIcon: string;
  vaultContract: string;
  safeContract: string;
  description: string;
  strategy: string;
  isAirdropFarming: boolean;
  farmedProtocols: readonly string[];
  farmedProtocolIcons: readonly string[];
}; 