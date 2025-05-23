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
    // Connexion à MongoDB
    const client = await clientPromise;
    const db = client.db(vaultId);
    const collection = db.collection('subgraph');
    
    // Récupérer les événements pertinents
    const events = await collection
      .find({ 
        $or: [
          { type: 'settleDeposit' },
          { type: 'settleRedeem' },
          { type: 'totalAssetsUpdated' }
        ],
        blockTimestamp: { $exists: true, $ne: null }
      })
      .sort({ blockTimestamp: -1 })
      .limit(1)
      .toArray();

    // Récupérer le dernier TVL
    const latestEvent = events[0];
    const latestTvl = latestEvent?.totalAssets ? divideBigNumber(latestEvent.totalAssets, decimals) : '0';

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
  } catch (error) {
    console.error('Error fetching vault data:', error);
    return {
      status: 500,
      error: 'Internal server error'
    };
  }
}; 