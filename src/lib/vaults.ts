import { base, mainnet } from '@wagmi/core/chains';

// Network constants
export const NETWORKS = {
  ETHEREUM: {
    name: 'Ethereum',
    chainId: mainnet.id
  },
  BASE: {
    name: 'Base',
    chainId: base.id
  }
} as const;

// Asset constants
export const ASSETS = {
  logos: {
    detrade: '/logo-detrade-white.webp'
  },
  icons: {
    usdc: '/usdc.webp',
    base: '/base.webp',
    resolv: '/usr.webp',
    eurc: '/eurc.webp',
    eth: '/eth.webp',
    weth: '/weth.webp',
    eigenlayer: '/eigenlayer.webp',
    cbbtc: '/cbbtc.webp',
    tac: '/tac.png'
  }
} as const;

// Block explorers URLs
export const BLOCK_EXPLORERS: Record<string, { name: string; baseUrl: string }> = {
  [NETWORKS.ETHEREUM.name]: {
    name: 'Etherscan',
    baseUrl: 'https://etherscan.io/address/'
  },
  [NETWORKS.BASE.name]: {
    name: 'BaseScan',
    baseUrl: 'https://basescan.org/address/'
  }
} as const;

// Liste complète des vaults (privée)
export const ALL_VAULTS = [
  {
    id: "detrade-core-usdc",
    name: "DeTrade Core USDC",
    ticker: "dtUSDC",
    curator: "DeTrade",
    curatorWebsite: "https://detrade.fund/",
    curatorIcon: ASSETS.logos.detrade,
    underlyingToken: "USDC",
    underlyingTokenIcon: ASSETS.icons.usdc,
    underlyingTokenDecimals: 6,
    underlyingTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: NETWORKS.BASE.name,
    chainId: NETWORKS.BASE.chainId,
    coingeckoId: "usd-coin",
    networkIcon: ASSETS.icons.base,
    vaultContract: "0x8092cA384D44260ea4feaf7457B629B8DC6f88F0",
    safeContract: "0xc6835323372A4393B90bCc227c58e82D45CE4b7d",
    administrator: "0xc6835323372A4393B90bCc227c58e82D45CE4b7d",
    priceOracle: "0xc6835323372A4393B90bCc227c58e82D45CE4b7d",
    performanceFee: "15%",
    feeReceiver: "0x7489d305F10760d686F8d4BB2e211a7f31c2f787",
    created_at: "05/03/2025",
    description: "This vault maximizes risk-adjusted yields for your USDC by diversifying across stablecoins and DeFi protocols for optimal market returns.",
    strategy: "Strategies include providing liquidity, investing in yield-bearing stablecoins, leveraging yield derivatives for fixed rates, and exploring opportunities that deliver high yields with managed risk.",
    isAirdropFarming: true,
    farmedProtocols: ["Resolv", "TAC"],
    farmedProtocolIcons: [ASSETS.icons.resolv, ASSETS.icons.tac],
    isActive: true
  },
  {
    id: "detrade-core-eth",
    name: "DeTrade Core ETH",
    ticker: "dtETH",
    curator: "DeTrade",
    curatorWebsite: "https://detrade.fund/",
    curatorIcon: ASSETS.logos.detrade,
    underlyingToken: "WETH",
    underlyingTokenIcon: ASSETS.icons.weth,
    underlyingTokenAddress: "0x4200000000000000000000000000000000000006",
    underlyingTokenDecimals: 18,
    network: NETWORKS.BASE.name,
    chainId: NETWORKS.BASE.chainId,
    coingeckoId: "ethereum",
    networkIcon: ASSETS.icons.base,
    vaultContract: "0x9b97BFDfE44D1B113ECD4BF2f243ed36acA34523",
    safeContract: "0x66DbceE7feA3287B3356227d6F3DfF3CeFbC6F3C",
    administrator: "0x66DbceE7feA3287B3356227d6F3DfF3CeFbC6F3C",
    priceOracle: "0x66DbceE7feA3287B3356227d6F3DfF3CeFbC6F3C",
    performanceFee: "15%",
    feeReceiver: "0x7489d305F10760d686F8d4BB2e211a7f31c2f787",
    created_at: "15/05/2025",
    description: "This vault maximizes risk-adjusted yields for your ETH by diversifying across Ethereum-based DeFi protocols and staking opportunities for optimal market returns.",
    strategy: "Strategies include staking, providing liquidity in ETH pairs, participating in DeFi protocols, and exploring opportunities that deliver high yields with managed risk.",
    isAirdropFarming: false,
    farmedProtocols: [],
    farmedProtocolIcons: [],
    isActive: true
  },
  {
    id: "detrade-core-eurc",
    name: "DeTrade Core EURC",
    ticker: "dtEURC",
    curator: "DeTrade",
    curatorWebsite: "https://detrade.fund/",
    curatorIcon: ASSETS.logos.detrade,
    underlyingToken: "EURC",
    underlyingTokenIcon: ASSETS.icons.eurc,
    underlyingTokenDecimals: 6,
    underlyingTokenAddress: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42",
    network: NETWORKS.BASE.name,
    chainId: NETWORKS.BASE.chainId,
    coingeckoId: "euro-coin",
    networkIcon: ASSETS.icons.base,
    vaultContract: "0xd4401d8bea82e4e6c40bb26ae3a04d2fb7ca4550",
    safeContract: "0xd201B0947AE7b057B0751e227B07D37b1a771570",
    administrator: "0xd201B0947AE7b057B0751e227B07D37b1a771570",
    priceOracle: "0xd201B0947AE7b057B0751e227B07D37b1a771570",
    performanceFee: "0%",
    feeReceiver: "0xd201B0947AE7b057B0751e227B07D37b1a771570",
    created_at: "16/06/25",
    description: "This vault maximizes risk-adjusted yields for your EURC by diversifying across Euro-pegged stablecoins and DeFi protocols for optimal market returns.",
    strategy: "Strategies include providing liquidity, investing in yield-bearing Euro stablecoins, leveraging yield derivatives for fixed rates, and exploring opportunities that deliver high yields with managed risk.",
    isAirdropFarming: false,
    farmedProtocols: ["Resolv", "TAC"],
    farmedProtocolIcons: [ASSETS.icons.resolv, ASSETS.icons.tac],
    isActive: true
  },
  {
    id: "detrade-core-cbbtc",
    name: "DeTrade Core cbBTC",
    ticker: "DTCBBTC",
    curator: "DeTrade",
    curatorWebsite: "https://detrade.fund/",
    curatorIcon: ASSETS.logos.detrade,
    underlyingToken: "cbBTC",
    underlyingTokenIcon: ASSETS.icons.cbbtc,
    underlyingTokenDecimals: 8,
    network: NETWORKS.BASE.name,
    chainId: NETWORKS.BASE.chainId,
    coingeckoId: "coinbase-wrapped-btc",
    networkIcon: ASSETS.icons.base,
    vaultContract: "0x1234567890123456789012345678901234567890",
    safeContract: "0x0987654321098765432109876543210987654321",
    administrator: "0x0987654321098765432109876543210987654321",
    priceOracle: "0x0987654321098765432109876543210987654321",
    performanceFee: "10%",
    feeReceiver: "0x0987654321098765432109876543210987654321",
    created_at: "N/A",
    description: "This vault maximizes risk-adjusted yields for your cbBTC by diversifying across Bitcoin-based DeFi protocols and staking opportunities for optimal market returns.",
    strategy: "Strategies include staking, providing liquidity in BTC pairs, participating in DeFi protocols, and exploring opportunities that deliver high yields with managed risk.",
    isAirdropFarming: false,
    farmedProtocols: [],
    farmedProtocolIcons: [],
    isActive: false
  },
  {
    id: "dev-detrade-core-usdc",
    name: "dev DeTrade Core USDC",
    ticker: "dev-dtUSDC",
    curator: "DeTrade",
    curatorWebsite: "https://detrade.fund/",
    curatorIcon: ASSETS.logos.detrade,
    underlyingToken: "USDC",
    underlyingTokenIcon: ASSETS.icons.usdc,
    underlyingTokenDecimals: 6,
    underlyingTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: NETWORKS.BASE.name,
    chainId: NETWORKS.BASE.chainId,
    coingeckoId: "usd-coin",
    networkIcon: ASSETS.icons.base,
    vaultContract: "0xBC29B6c682c447Ddc3143B3D8ba781163FC8A6f2",
    safeContract: "0xAbD81C60a18A34567151eA70374eA9c839a41cF5",
    administrator: "0xAbD81C60a18A34567151eA70374eA9c839a41cF5",
    priceOracle: "0xAbD81C60a18A34567151eA70374eA9c839a41cF5",
    performanceFee: "20%",
    feeReceiver: "0x7489d305F10760d686F8d4BB2e211a7f31c2f787",
    created_at: "17/02/2025",
    description: "This vault maximizes risk-adjusted yields for your USDC by diversifying across stablecoins and DeFi protocols for optimal market returns.",
    strategy: "Strategies include providing liquidity, investing in yield-bearing stablecoins, leveraging yield derivatives for fixed rates, and exploring opportunities that deliver high yields with managed risk.",
    isAirdropFarming: true,
    farmedProtocols: ["Resolv", "TAC"],
    farmedProtocolIcons: [ASSETS.icons.resolv, ASSETS.icons.tac],
    isActive: true
  }
] as const;