import { ALL_VAULTS, NETWORKS } from '$lib/vaults';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const vaultId = params.id;
  const vault = ALL_VAULTS.find(v => v.id === vaultId);

  if (!vault) {
    return {
      status: 404,
      error: 'Vault not found'
    };
  }

  // Fetch TVL data
  const tvlResponse = await fetch(`/api/vaults/${vaultId}/metrics/tvl`);
  const tvlData = await tvlResponse.json();
  const latestTvl = tvlData.tvl?.[tvlData.tvl.length - 1]?.totalAssets || '0';

  // Fetch 30D APR data
  const apr30dResponse = await fetch(`/api/vaults/${vaultId}/metrics/30d_apr`);
  const apr30dData = await apr30dResponse.json();
  const apr30dValue = apr30dData.apr || 0;

  // Fetch Net APR data
  const netAprResponse = await fetch(`/api/vaults/${vaultId}/metrics/net_apr`);
  const netAprData = await netAprResponse.json();
  const netAprValue = netAprData.apr || 0;

  // Fetch price data
  const priceResponse = await fetch(`/api/price/${vault.underlyingToken}`);
  const priceData = await priceResponse.json();
  const tvlUsd = (latestTvl && priceData.price) ? parseFloat(latestTvl) * priceData.price : 0;

  return {
    vault,
    tvlUsd,
    netAprValue,
    apr30dValue,
    network: {
      icon: vault.networkIcon,
      name: vault.network === NETWORKS.BASE.name ? NETWORKS.BASE.name : NETWORKS.ETHEREUM.name
    }
  };
}; 