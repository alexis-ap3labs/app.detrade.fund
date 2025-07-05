import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// Cache en mémoire pour les métriques (3 minutes)
const metricsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

// Fonction divideBigNumber identique à l'endpoint TVL original
function divideBigNumber(value: string, decimals: number): string {
  const valueBigInt = BigInt(value);
  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = valueBigInt / divisor;
  const decimalPart = valueBigInt % divisor;
  const decimalStr = decimalPart.toString().padStart(decimals, '0');
  return `${integerPart}.${decimalStr}`;
}

// Fonction isValidTimestamp identique à l'endpoint TVL original
function isValidTimestamp(timestamp: number): boolean {
  return !isNaN(timestamp) && 
         timestamp > 0 && 
         timestamp < 2147483647 && 
         timestamp < Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
}

interface VaultMetrics {
  tvl: { totalAssets: string; timestamp: string } | null;
  netApr: number | null;
  thirtyDayApr: number | null;
  sevenDayApr: number | null;
}

// Fonction calculatePps identique aux endpoints originaux
function calculatePps(event: any, relatedEvents: any[], decimals: number): { raw: string, formatted: number } | null {
  let rawPps: string;
  
  // Look for settleDeposit event first
  const settleDepositEvent = relatedEvents.find(e => e.type === 'settleDeposit');
  if (settleDepositEvent?.totalAssets && settleDepositEvent?.totalSupply) {
    try {
      const totalAssets = BigInt(settleDepositEvent.totalAssets);
      const totalSupply = BigInt(settleDepositEvent.totalSupply);
      const normalizedAssets = totalAssets * BigInt(Math.pow(10, 18 - decimals));
      const ppsValue = (normalizedAssets * BigInt(Math.pow(10, 18))) / totalSupply;
      rawPps = ppsValue.toString();
    } catch (error) {
      console.error('Error calculating PPS:', error);
      rawPps = Math.pow(10, 18).toString();
    }
  } else {
    // If no settleDeposit, look for settleRedeem event
    const settleRedeemEvent = relatedEvents.find(e => e.type === 'settleRedeem');
    if (settleRedeemEvent?.totalAssets && settleRedeemEvent?.totalSupply) {
      try {
        const totalAssets = BigInt(settleRedeemEvent.totalAssets);
        const totalSupply = BigInt(settleRedeemEvent.totalSupply);
        const normalizedAssets = totalAssets * BigInt(Math.pow(10, 18 - decimals));
        const ppsValue = (normalizedAssets * BigInt(Math.pow(10, 18))) / totalSupply;
        rawPps = ppsValue.toString();
      } catch (error) {
        console.error('Error calculating PPS:', error);
        rawPps = Math.pow(10, 18).toString();
      }
    } else {
      // If no settleRedeem, look for highWaterMarkUpdated event
      const highWaterMarkEvent = relatedEvents.find(e => e.type === 'highWaterMarkUpdated');
      if (highWaterMarkEvent?.newHighWaterMark) {
        const highWaterMarkValue = Number(highWaterMarkEvent.newHighWaterMark) / Math.pow(10, decimals);
        rawPps = (BigInt(Math.floor(highWaterMarkValue * Math.pow(10, 18)))).toString();
      } else {
        return null;
      }
    }
  }

  const formatted = Number(rawPps) / Math.pow(10, 18);
  return { raw: rawPps, formatted };
}

// Fonction calculateNetApr identique aux endpoints originaux
function calculateNetApr(events: any[]): { apr: number } {
  if (events.length < 2) return { apr: 0 };

  const sortedEvents = [...events].sort((a, b) => a.blockTimestamp - b.blockTimestamp);
  const oldestEvent = sortedEvents[0];
  const newestEvent = sortedEvents[sortedEvents.length - 1];
  
  const oldestPps = Number(oldestEvent.ppsFormatted.toFixed(6));
  const newestPps = Number(newestEvent.ppsFormatted.toFixed(6));
  const totalReturn = Number(((newestPps - oldestPps) / oldestPps).toFixed(6));
  
  const durationInSeconds = newestEvent.blockTimestamp - oldestEvent.blockTimestamp;
  const durationInYears = Number((durationInSeconds / (365 * 24 * 60 * 60)).toFixed(8));
  
  let apr;
  if (durationInYears >= 1) {
    apr = Number(((Math.pow(1 + totalReturn, 1 / durationInYears) - 1) * 100).toFixed(2));
  } else {
    apr = Number(((totalReturn / durationInYears) * 100).toFixed(2));
  }
  
  return { apr };
}

// Fonction pour calculer l'APR sur une période donnée
function calculatePeriodApr(events: any[], days: number): number | null {
  if (events.length < 2) return null;

  const sortedEvents = [...events].sort((a, b) => b.blockTimestamp - a.blockTimestamp);
  const latestPps = Number(sortedEvents[0]?.ppsFormatted.toFixed(6));
  const targetTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  
  let closestEvent = sortedEvents[0];
  let minDaysDiff = Infinity;
  
  for (const event of sortedEvents) {
    const daysDiff = Math.abs((sortedEvents[0].blockTimestamp - event.blockTimestamp) / (24 * 60 * 60) - days);
    if (daysDiff < minDaysDiff) {
      minDaysDiff = daysDiff;
      closestEvent = event;
    }
  }
  
  const durationInSeconds = sortedEvents[0].blockTimestamp - closestEvent.blockTimestamp;
  const durationInYears = Number((durationInSeconds / (365 * 24 * 60 * 60)).toFixed(8));
  const periodReturn = Number(((latestPps - closestEvent.ppsFormatted) / closestEvent.ppsFormatted).toFixed(6));
  
  return Number(((periodReturn / durationInYears) * 100).toFixed(2));
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const vaultIds = url.searchParams.get('vaultIds')?.split(',') || [];
    
    if (vaultIds.length === 0) {
      return json({ error: 'No vault IDs provided' }, { status: 400 });
    }

    // Vérifier le cache
    const cacheKey = vaultIds.sort().join(',');
    const cached = metricsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      return json(cached.data);
    }

    // Filtrer les vaults valides et actifs
    const activeVaultIds = vaultIds.filter(id => {
      const vault = ALL_VAULTS.find(v => v.id === id);
      return vault && vault.isActive;
    });

    if (activeVaultIds.length === 0) {
      return json({ error: 'No valid active vaults found' }, { status: 404 });
    }

    console.log(`Fetching correct bulk metrics for ${activeVaultIds.length} vaults:`, activeVaultIds);

    if (!env.MONGO_URI) {
      return json({ error: 'Database configuration error' }, { status: 500 });
    }

    const client = await clientPromise;
    const results: Record<string, VaultMetrics> = {};

    // Traiter tous les vaults en parallèle
    await Promise.all(
      activeVaultIds.map(async (vaultId) => {
        const vault = ALL_VAULTS.find(v => v.id === vaultId);
        if (!vault) return;
        
        try {
          const db = client.db(vaultId);
          const collection = db.collection('subgraph');

          // Récupérer TVL avec la logique EXACTE de l'endpoint original
          const tvlEvents = await collection
            .find({ 
              $or: [
                { type: 'settleDeposit' },
                { type: 'settleRedeem' },
                { type: 'totalAssetsUpdated' }
              ],
              blockTimestamp: { $exists: true, $ne: null }
            })
            .sort({ blockTimestamp: -1 })
            .limit(5)
            .toArray();

          // Appliquer la logique de priorisation EXACTE de l'endpoint TVL original
          const processedTvlEvents = tvlEvents
            .filter(event => event.blockTimestamp && event.totalAssets && isValidTimestamp(event.blockTimestamp))
            .reduce((acc: any[], event) => {
              const existingEvent = acc.find(e => e.blockTimestamp === event.blockTimestamp);
              
              if (existingEvent) {
                // Logique de priorisation: settleRedeem > settleDeposit > totalAssetsUpdated
                let shouldReplace = false;
                
                if (event.type === 'settleRedeem') {
                  shouldReplace = true;
                } else if (event.type === 'settleDeposit' && existingEvent.type === 'totalAssetsUpdated') {
                  shouldReplace = true;
                }
                
                if (shouldReplace) {
                  acc = acc.filter(e => e.blockTimestamp !== event.blockTimestamp);
                  acc.push({
                    blockTimestamp: event.blockTimestamp,
                    totalAssets: parseFloat(divideBigNumber(event.totalAssets || '0', vault.underlyingTokenDecimals)),
                    type: event.type
                  });
                }
              } else {
                // Nouvel événement
                acc.push({
                  blockTimestamp: event.blockTimestamp,
                  totalAssets: parseFloat(divideBigNumber(event.totalAssets || '0', vault.underlyingTokenDecimals)),
                  type: event.type
                });
              }
              return acc;
            }, []);

          let tvl = null;
          if (processedTvlEvents.length > 0) {
            const latestEvent = processedTvlEvents[0];
            tvl = {
              totalAssets: latestEvent.totalAssets.toString(),
              timestamp: new Date(latestEvent.blockTimestamp * 1000).toISOString()
            };
          }

          // Récupérer événements pour les calculs APR (optimisé: 50 événements max)
          const totalAssetsEvents = await collection
            .find({ 
              type: 'totalAssetsUpdated',
              blockTimestamp: { $exists: true, $ne: null }
            })
            .sort({ blockTimestamp: -1 })
            .limit(50)
            .toArray();

          // Construire les événements avec PPS (logique identique aux endpoints originaux)
          const allEvents = [];
          
          for (const event of totalAssetsEvents) {
            let transactionHash = '';
            if ('transactionHash' in event && event.transactionHash) {
              transactionHash = event.transactionHash;
            } else {
              const hashFromId = event.id.match(/^(0x[a-f0-9]{64})/)?.[1];
              if (hashFromId) {
                transactionHash = hashFromId;
              }
            }

            if (transactionHash) {
              const relatedEvents = await collection
                .find({
                  $or: [
                    { transactionHash },
                    { id: { $regex: `^${transactionHash}` } }
                  ]
                })
                .toArray();

              const ppsResult = calculatePps(event, relatedEvents, vault.underlyingTokenDecimals);
              if (ppsResult) {
                allEvents.push({
                  timestamp: new Date(parseInt(event.blockTimestamp) * 1000).toISOString(),
                  blockTimestamp: parseInt(event.blockTimestamp),
                  transactionHash,
                  pps: ppsResult.raw,
                  ppsFormatted: ppsResult.formatted,
                });
              }
            }
          }

          // Calculer les APR avec la logique correcte
          let netApr = null, thirtyDayApr = null, sevenDayApr = null;
          
          if (allEvents.length >= 2) {
            const netAprResult = calculateNetApr(allEvents);
            netApr = netAprResult.apr;
            
            thirtyDayApr = calculatePeriodApr(allEvents, 30);
            sevenDayApr = calculatePeriodApr(allEvents, 7);
          }

          results[vaultId] = {
            tvl,
            netApr,
            thirtyDayApr,
            sevenDayApr
          };

        } catch (error) {
          console.error(`Error fetching metrics for vault ${vaultId}:`, error);
          results[vaultId] = {
            tvl: null,
            netApr: null,
            thirtyDayApr: null,
            sevenDayApr: null
          };
        }
      })
    );

    const responseData = { vaults: results };
    metricsCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    console.log(`Correct bulk metrics fetch completed for ${Object.keys(results).length} vaults`);
    return json(responseData);

  } catch (error) {
    console.error('Error in bulk metrics fetch:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 