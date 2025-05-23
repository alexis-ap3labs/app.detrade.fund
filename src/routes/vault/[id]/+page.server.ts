import { ALL_VAULTS, NETWORKS } from '$lib/vaults';
import type { PageServerLoad } from './$types';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';

function divideBigNumber(value: string, decimals: number): string {
  const valueBigInt = BigInt(value);
  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = valueBigInt / divisor;
  const decimalPart = valueBigInt % divisor;
  const decimalStr = decimalPart.toString().padStart(decimals, '0');
  return `${integerPart}.${decimalStr}`;
}

function isValidTimestamp(timestamp: number): boolean {
  return !isNaN(timestamp) && 
         timestamp > 0 && 
         timestamp < 2147483647 &&
         timestamp < Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
}

export const load: PageServerLoad = async ({ params, fetch }) => {
  const vaultId = params.id;
  const vault = ALL_VAULTS.find(v => v.id === vaultId);

  if (!vault) {
    return {
      status: 404,
      error: 'Vault not found'
    };
  }

  // Récupérer les décimales du token sous-jacent
  const decimals = vault.underlyingTokenDecimals;
  if (!decimals) {
    console.error(`No decimals found for vault ${vaultId}`);
    return {
      status: 500,
      error: 'Invalid vault configuration'
    };
  }

  // Vérifier l'URI MongoDB
  if (!env.MONGO_URI) {
    return {
      status: 500,
      error: 'Database configuration error'
    };
  }

  try {
    // Fetch TVL data with latest=true parameter
    const tvlResponse = await fetch(`/api/vaults/${vaultId}/metrics/tvl?latest=true`);
    const tvlData = await tvlResponse.json();
    const totalAssets = tvlData.latestTvl?.totalAssets || '0';

    // Fetch 30D APR data
    const apr30dResponse = await fetch(`/api/vaults/${vaultId}/metrics/30d_apr`);
    const apr30dData = await apr30dResponse.json();
    const apr30dValue = apr30dData.apr || 0;

    // Fetch Net APR data
    const netAprResponse = await fetch(`/api/vaults/${vaultId}/metrics/net_apr`);
    const netAprData = await netAprResponse.json();
    const netAprValue = netAprData.apr || 0;

    console.log('TVL Data:', {
      totalAssets
    });

    return {
      vault,
      totalAssets,
      netAprValue,
      apr30dValue,
      network: {
        icon: vault.networkIcon,
        name: vault.network === NETWORKS.BASE.name ? NETWORKS.BASE.name : NETWORKS.ETHEREUM.name
      }
    };
  } catch (error) {
    console.error('Error fetching vault data:', error);
    return {
      status: 500,
      error: 'Internal server error'
    };
  }
}; 